import type { Schema } from '../../api/client';
import type { SessionState, Submission } from '../../session/controller';
import { toolSummary } from '../../session/tool-summary';
import { groupToolResults } from '../chat/conversation-history';
import { contentBlocks, resultText } from '../chat/toolviews/tool-content';

export const recordKinds = ['user', 'assistant', 'thinking', 'tool', 'context', 'compaction'] as const;
export type RecordKind = (typeof recordKinds)[number];
export const kindLabels: Record<RecordKind, string> = {
  user: 'User', assistant: 'Assistant', thinking: 'Reasoning', tool: 'Tool',
  context: 'Context', compaction: 'Compaction',
};
const submissionLabels: Record<Submission['state'], string> = {
  sending: 'Sending', uncertain: 'Delivery unknown', accepted: 'Accepted', running: 'Running',
  delivered: 'Delivered', completed: 'Completed', withdrawn: 'Withdrawn', canceled: 'Canceled',
  reviewed: 'Outcome reviewed', failed: 'Failed',
};

export interface TrajectoryRecord {
  key: string;
  kind: RecordKind;
  title: string;
  preview: string;
  status: string;
  failed: boolean;
  live: boolean;
  timestamp?: string;
  timestampLabel?: 'Saved' | 'Submitted';
  sections: { label: string; text: string }[];
  raw: unknown;
}

export function inspectJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '';
}

function imageSummary(content: unknown): string {
  return contentBlocks(content)
    .filter((block) => block.type === 'image')
    .map((block) => `[Image: ${block.media_type ?? 'unknown format'}${block.hash ? `, ${block.hash}` : ''}]`)
    .join('\n');
}

function resultSummary(content: unknown, output = '', state = 'completed'): string {
  return [resultText({ content, output, state }), imageSummary(content)].filter(Boolean).join('\n\n');
}

/** The controller owns saved/live reconciliation. Never deduplicate by text or tool ID across
 * that boundary: identical messages and reused IDs in later rounds are legitimate history. */
export function trajectoryRecords(state: SessionState): TrajectoryRecord[] {
  const records: TrajectoryRecord[] = [];
  const history = groupToolResults(state.saved?.messages ?? []);
  for (const { index, message, blocks } of history.messages) {
    const key = `saved:${state.saved?.revision ?? 0}:${state.offset + index}`;
    const common = {
      status: 'Saved', failed: false, live: false,
      ...(message.created_at && Number.isFinite(Date.parse(message.created_at))
        ? { timestamp: message.created_at, timestampLabel: 'Saved' as const } : {}),
    };
    if (message.compaction) {
      const summary = message.content.flatMap((block) =>
        block.type === 'text' || block.type === 'turn_context' ? [block.text] : [],
      ).join('\n\n');
      records.push({ ...common, key, kind: 'compaction', title: 'Context compacted',
        preview: `Generation ${message.compaction.generation}`,
        sections: [
          { label: 'Compaction', text: `Generation ${message.compaction.generation}. ${message.compaction.replaced_count} materialized messages replaced, including any re-appended tail.` },
          ...(summary ? [{ label: 'Summary', text: summary }] : []),
        ], raw: message });
      continue;
    }
    for (const { block, index: blockIndex } of blocks) {
      const base = { ...common, key: `${key}:${blockIndex}` };
      if (block.type === 'tool_use') {
        const result = history.results.get(block);
        const resultBody = result ? resultSummary(result.content) : '';
        records.push({ ...base, kind: 'tool', title: block.name,
          preview: toolSummary(block.name, block.input) ?? block.id,
          status: result ? result.is_error ? 'Failed' : 'Completed' : 'Result unavailable',
          failed: result?.is_error ?? false,
          sections: [
            { label: 'Input', text: inspectJson(block.input) },
            { label: 'Result', text: resultBody || (result ? 'Empty result.' : 'No unambiguous result is available in the loaded history.') },
          ], raw: { call: block, ...(result ? { result } : {}) } });
      } else if (block.type === 'tool_result') {
        const text = resultSummary(block.content);
        records.push({ ...base, kind: 'tool', title: 'Unpaired tool result',
          preview: block.tool_use_id, status: block.is_error ? 'Failed' : 'Completed',
          failed: block.is_error, sections: [{ label: 'Result', text: text || 'Empty result.' }], raw: block });
      } else {
        const kind: RecordKind = block.type === 'thinking' || block.type === 'redacted_thinking'
          ? 'thinking' : block.type === 'turn_context' ? 'context'
          : message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'context';
        const text = blockText(block);
        records.push({ ...base, kind, title: block.type === 'image' ? `${kindLabels[kind]} image` : kindLabels[kind],
          preview: text, sections: [{ label: 'Content', text }], raw: block });
      }
    }
  }

  const submissions = new Map(state.submissions.filter((submission) => submission.preview)
    .map((submission) => [submission.key, submission]));
  const shownTools = new Set<string>();
  const shownSubmissions = new Set<string>();
  state.blocks.forEach((block, index) => {
    const common = { key: `live:${index}`, failed: false, live: true };
    if (block.kind === 'submission') {
      const submission = submissions.get(block.key);
      if (!submission || shownSubmissions.has(block.key)) return;
      shownSubmissions.add(block.key);
      const images = 'images' in submission.body ? submission.body.images ?? [] : [];
      const text = [submission.body.message,
        ...images.map((image) => `[Image: ${image.media_type}]`),
      ].filter(Boolean).join('\n\n');
      // Image bytes are not useful in a JSON inspector and can be several megabytes each.
      const raw = { ...submission, body: { ...submission.body,
        ...('images' in submission.body ? { images: images.map(({ media_type }) => ({ media_type, data: '[image data omitted]' })) } : {}),
      } };
      records.push({ ...common, key: `submission:${block.key}`, kind: 'user', title: 'User',
        preview: text, status: submissionLabels[submission.state], failed: submission.state === 'failed',
        ...(Number.isFinite(Date.parse(submission.createdAt))
          ? { timestamp: submission.createdAt, timestampLabel: 'Submitted' as const } : {}),
        sections: [{ label: 'Content', text }, ...(submission.error ? [{ label: 'Error', text: submission.error }] : [])], raw });
    } else if (block.kind === 'tool') {
      const tool = state.tools[block.id];
      if (!tool || shownTools.has(tool.id)) return;
      shownTools.add(tool.id);
      const result = resultSummary(tool.content, tool.output, tool.state);
      records.push({ ...common, kind: 'tool', title: tool.name,
        preview: toolSummary(tool.name, tool.input, tool.displaySummary) ?? tool.id,
        status: { composing: 'Preparing', executing: 'Running', completed: 'Completed', error: 'Failed', ended: 'Interrupted' }[tool.state],
        failed: tool.state === 'error',
        sections: [
          { label: 'Input', text: inspectJson(tool.input) || 'Arguments are being prepared.' },
          ...(result ? [{ label: 'Result', text: result }] : []),
          ...(tool.activity ? [{ label: 'Activity', text: tool.activity }] : []),
          ...(tool.progress ? [{ label: 'Progress', text: tool.progress }] : []),
        ], raw: tool });
    } else if (block.text.trim()) {
      const kind = block.kind === 'thinking' ? 'thinking' : 'assistant';
      records.push({ ...common, kind, title: kindLabels[kind], preview: block.text,
        status: state.running ? 'Live' : 'Awaiting saved history',
        sections: [{ label: 'Content', text: block.text }], raw: block });
    }
  });
  return records;
}

function blockText(block: Schema['ContentBlockView']): string {
  switch (block.type) {
    case 'text': case 'turn_context': return block.text;
    case 'thinking': return block.thinking;
    case 'redacted_thinking': return 'Reasoning was redacted by the provider.';
    case 'image': return `Image: ${block.media_type}${block.hash ? `\n${block.hash}` : ''}`;
    default: return '';
  }
}

export function filterRecords(
  records: readonly TrajectoryRecord[], query: string, kind: RecordKind | 'all', failedOnly: boolean,
): TrajectoryRecord[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    if ((kind !== 'all' && record.kind !== kind) || (failedOnly && !record.failed)) return false;
    if (!terms.length) return true;
    const text = [record.title, record.preview, record.status, kindLabels[record.kind],
      ...record.sections.map((section) => section.text),
    ].join('\n').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
