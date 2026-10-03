import type { SessionState } from '../../session/controller';
import { groupToolResults } from '../chat/conversation-history';
import { isRecord } from '../chat/toolviews/tool-content';

const fileTools = new Set(['file_write', 'write_file', 'file_edit', 'edit_file', 'file_read', 'read_file']);
function filePath(name: string, input: unknown): string | undefined {
  if (!fileTools.has(name) || !isRecord(input)) return;
  const path = typeof input.path === 'string' ? input.path : input.file_path;
  return typeof path === 'string' && path.trim() ? path : undefined;
}

/** Tool records supply navigation shortcuts only. File bytes always come from the file server. */
export function conversationFiles(state: Pick<SessionState, 'saved' | 'tools' | 'blocks'>): string[] {
  const paths = new Set<string>();
  const messages = state.saved?.messages ?? [];
  const { results } = groupToolResults(messages);
  for (const message of messages) {
    if (message.role !== 'assistant' || message.compaction) continue;
    for (const block of message.content) {
      if (block.type !== 'tool_use' || results.get(block)?.is_error !== false) continue;
      const path = filePath(block.name, block.input);
      if (path) paths.add(path);
    }
  }
  for (const block of state.blocks) {
    if (block.kind !== 'tool') continue;
    const tool = state.tools[block.id];
    if (tool?.state !== 'completed') continue;
    const path = filePath(tool.name, tool.input);
    if (path) paths.add(path);
  }
  return [...paths];
}
