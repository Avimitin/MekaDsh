import { describe, expect, it } from 'vitest';
import type { Schema } from '../../api/client';
import type { LiveTool, SessionState } from '../../session/controller';
import { conversationFiles } from './conversation-files';

type Block = Schema['ContentBlockView'];
const use = (id: string, path: string, content = '', name = 'file_write'): Block => ({ type: 'tool_use', id, name, input: { path, content } });
const result = (id: string, is_error = false, text = 'Done'): Block => ({ type: 'tool_result', tool_use_id: id, is_error, content: [{ type: 'text', text }] });
const message = (role: Schema['MessageView']['role'], ...content: Block[]): Schema['MessageView'] => ({ role, content });
function state(messages: Schema['MessageView'][] = [], tools: LiveTool[] = []): Pick<SessionState, 'saved' | 'tools' | 'blocks' | 'offset'> {
  return { saved: { session_id: 'session', revision: 0, total: messages.length, messages },
    tools: Object.fromEntries(tools.map((tool) => [tool.id, tool])),
    blocks: tools.map((tool) => ({ kind: 'tool', id: tool.id })), offset: 0 };
}
function live(overrides: Partial<LiveTool> = {}): LiveTool {
  return { id: 'a', name: 'file_write', input: { path: 'a.md', content: 'hello' }, state: 'completed', content: [{ type: 'text', text: 'Done' }], output: '', activity: '', progress: '', ...overrides };
}

describe('conversation file shortcuts', () => {
  it('includes only successful calls, matching parallel results by ID', () => {
    expect(conversationFiles(state([
      message('assistant', use('a', 'a.md', 'partial content'), use('b', 'b.md')),
      message('user', result('b', true), result('a')),
    ]))).toEqual(['a.md']);
  });
  it('does not count proposed writes, orphan results, or ambiguous IDs', () => {
    expect(conversationFiles(state([
      message('assistant', use('a', 'one'), use('a', 'two'), use('b', 'proposed')),
      message('user', result('a'), result('orphan')),
    ]))).toEqual([]);
  });
  it('deduplicates paths across saved and live calls without storing file content', () => {
    expect(conversationFiles(state([
      message('assistant', use('a', 'a.md', 'old content')), message('user', result('a')),
      message('assistant', use('a', 'other.md', 'new content')), message('user', result('a')),
    ], [live()]))).toEqual(['a.md', 'other.md']);
  });
  it('excludes running, failed, interrupted, and invisible live calls', () => {
    for (const status of ['composing', 'executing', 'error', 'ended'] as const)
      expect(conversationFiles(state([], [live({ state: status })]))).toEqual([]);
    const hidden = state([], [live()]); hidden.blocks = [];
    expect(conversationFiles(hidden)).toEqual([]);
  });
  it('supports old and new file tool names without reading snippets', () => {
    for (const name of ['file_read', 'read_file', 'file_edit', 'edit_file', 'file_write', 'write_file']) {
      expect(conversationFiles(state([], [live({ name, input: { file_path: '/tmp/file.txt' } })]))).toEqual(['/tmp/file.txt']);
    }
  });
  it('ignores unsupported tools and malformed paths', () => {
    for (const tool of [live({ name: 'shell_execute' }), live({ input: null }), live({ input: { path: 3 } }), live({ input: { path: ' ' } })])
      expect(conversationFiles(state([], [tool]))).toEqual([]);
  });
});
