import type { SessionState } from '../../session/controller';
import { groupToolResults } from '../chat/conversation-history';
import { isRecord } from '../chat/toolviews/tool-content';

export type FileOperationKind = 'write' | 'edit' | 'read';
export interface RecordedOperation {
  key: string;
  id: string;
  kind: FileOperationKind;
  path: string;
  /** Exact recorded content, never a reconstruction of the current filesystem. */
  text: string | undefined;
  before: string | undefined;
  result: string | undefined;
  source: 'history' | 'live';
}
export interface RecordedFile {
  path: string;
  operations: RecordedOperation[];
}
const kinds: Readonly<Record<string, FileOperationKind>> = {
  file_write: 'write', write_file: 'write',
  file_edit: 'edit', edit_file: 'edit',
  file_read: 'read', read_file: 'read',
};
function field(input: unknown, key: string): string | undefined {
  return isRecord(input) && Object.hasOwn(input, key) && typeof input[key] === 'string'
    ? input[key] : undefined;
}
function textResult(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const texts = content.flatMap((block: unknown) =>
    isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []);
  return texts.length ? texts.join('\n') : undefined;
}
function operation(
  key: string, id: string, name: string, input: unknown, content: unknown,
  source: RecordedOperation['source'],
): RecordedOperation | undefined {
  const kind = Object.hasOwn(kinds, name) ? kinds[name] : undefined;
  const path = field(input, 'path') ?? field(input, 'file_path');
  if (!kind || !path?.trim()) return;
  const result = textResult(content);
  return {
    key, id, kind, path, source, result,
    text: kind === 'read' ? result : field(input, kind === 'write' ? 'content' : 'new_string'),
    before: kind === 'edit' ? field(input, 'old_string') : undefined,
  };
}
/** Only explicitly successful calls enter the file record. Pair history by round and ID. */
export function extractRecordedFiles(state: Pick<SessionState, 'saved' | 'tools' | 'blocks' | 'offset'>): RecordedFile[] {
  const operations: RecordedOperation[] = [];
  const messages = state.saved?.messages ?? [];
  const { results } = groupToolResults(messages);
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || message.compaction) return;
    message.content.forEach((block, blockIndex) => {
      if (block.type !== 'tool_use') return;
      const result = results.get(block);
      if (!result || result.is_error !== false) return;
      const item = operation(`saved-${state.offset + index}-${blockIndex}`, block.id, block.name,
        block.input, result.content, 'history');
      if (item) operations.push(item);
    });
  });
  const seenLive = new Set<string>();
  // The controller owns saved/live reconciliation. IDs and identical inputs can recur
  // in later rounds, so matching them here would silently lose successful operations.
  for (const block of state.blocks) {
    if (block.kind !== 'tool' || seenLive.has(block.id)) continue;
    seenLive.add(block.id);
    const tool = state.tools[block.id];
    if (!tool || tool.state !== 'completed') continue;
    const item = operation(`live-${tool.id}`, tool.id, tool.name, tool.input, tool.content, 'live');
    if (!item) continue;
    operations.push(item);
  }
  const files = new Map<string, RecordedFile>();
  for (const item of operations) {
    const file = files.get(item.path) ?? { path: item.path, operations: [] };
    file.operations.push(item);
    files.set(item.path, file);
  }
  return [...files.values()];
}

export function fileLanguage(path: string): string | undefined {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  return ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
    json: 'json', md: 'markdown', mdx: 'markdown', html: 'html', htm: 'html', css: 'css',
    py: 'python', rs: 'rust', go: 'go', sh: 'shell', bash: 'shell', nix: 'nix',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', svg: 'xml', xml: 'xml',
  } as Record<string, string>)[extension];
}

export function recordedDownloadName(operation: RecordedOperation): string {
  const name = operation.path.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, '') || 'file';
  // Read results may contain line numbers/truncation notices; edits are only replacement snippets.
  return operation.kind === 'write' ? name : `${name}.${operation.kind === 'read' ? 'read-result' : 'replacement'}.txt`;
}
