import { describe, expect, it } from 'vitest';
import type { Schema } from '../../api/client';
import type { LiveTool, SessionState } from '../../session/controller';
import { extractRecordedFiles, recordedDownloadName } from './recorded-files';

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

describe('recorded file extraction', () => {
  it('matches parallel calls by ID, never result order', () => {
    const files = extractRecordedFiles(state([
      message('assistant', use('a', 'a.md', 'A'), use('b', 'b.md', 'B')),
      message('user', result('b', true), result('a')),
    ]));
    expect(files.map((file) => file.path)).toEqual(['a.md']);
    expect(files[0]?.operations[0]?.text).toBe('A');
  });
  it('does not count a proposed write, an error, or a result without its call', () => {
    expect(extractRecordedFiles(state([
      message('assistant', use('a', 'a.md'), use('b', 'b.md')),
      message('user', result('b', true), result('orphan')),
    ]))).toEqual([]);
  });
  it('does not pair ambiguous IDs or reach into a later round', () => {
    expect(extractRecordedFiles(state([
      message('assistant', use('a', 'one'), use('a', 'two')),
      message('user', result('a')),
      message('assistant', use('b', 'three')),
      message('assistant', { type: 'text', text: 'next round' }),
      message('user', result('b')),
    ]))).toEqual([]);
  });
  it('keeps separate saved rounds even if their ID is reused', () => {
    const files = extractRecordedFiles(state([
      message('assistant', use('a', 'a.md', 'first')), message('user', result('a')),
      message('assistant', use('a', 'a.md', 'second')), message('user', result('a')),
    ]));
    expect(files[0]?.operations.map((op) => op.text)).toEqual(['first', 'second']);
  });
  it('keeps identical operations across saved and live rounds; the controller owns reconciliation', () => {
    const files = extractRecordedFiles(state([
      message('assistant', use('a', 'a.md', 'hello')), message('user', result('a')),
    ], [live()]));
    expect(files[0]?.operations).toHaveLength(2);
  });
  it('does not deduplicate a reused live ID with different inputs', () => {
    const files = extractRecordedFiles(state([
      message('assistant', use('a', 'a.md', 'old')), message('user', result('a')),
    ], [live()]));
    expect(files[0]?.operations.map((op) => op.text)).toEqual(['old', 'hello']);
  });
  it('excludes running, failed, and interrupted live calls', () => {
    for (const status of ['composing', 'executing', 'error', 'ended'] as const)
      expect(extractRecordedFiles(state([], [live({ state: status })]))).toEqual([]);
  });
  it('requires a visible live block and only includes it once', () => {
    const current = state([], [live()]);
    current.blocks = [];
    expect(extractRecordedFiles(current)).toEqual([]);
    current.blocks = [{ kind: 'tool', id: 'a' }, { kind: 'tool', id: 'a' }];
    expect(extractRecordedFiles(current)[0]?.operations).toHaveLength(1);
  });
  it('preserves empty writes and deletion replacements', () => {
    const files = extractRecordedFiles(state([], [live({ input: { path: 'empty.txt', content: '' } }),
      live({ id: 'b', name: 'file_edit', input: { path: 'delete.txt', old_string: 'remove', new_string: '' } })]));
    expect(files[0]?.operations[0]?.text).toBe('');
    expect(files[1]?.operations[0]).toMatchObject({ before: 'remove', text: '' });
  });
  it('keeps missing input content unavailable instead of inventing an empty file', () => {
    const files = extractRecordedFiles(state([], [live({ input: { path: 'unknown' } })]));
    expect(files[0]?.operations[0]?.text).toBeUndefined();
  });
  it('preserves read results exactly, including truncation and line labels', () => {
    const text = '10: some source\n[truncated]';
    const files = extractRecordedFiles(state([], [live({ name: 'file_read', content: [{ type: 'text', text }, { type: 'image', hash: 'abc' }] })]));
    expect(files[0]?.operations[0]?.text).toBe(text);
    expect(recordedDownloadName(files[0]!.operations[0]!)).toBe('a.md.read-result.txt');
  });
  it('ignores unsupported tools and malformed paths without throwing', () => {
    const tools = [live({ name: 'shell_execute' }), live({ id: 'b', input: { path: 3 } }),
      live({ id: 'c', input: null }), live({ id: 'd', input: { path: '  ' } })];
    expect(extractRecordedFiles(state([], tools))).toEqual([]);
  });
  it('supports the older API tool names and strips directories for downloads', () => {
    const files = extractRecordedFiles(state([], [live({ name: 'write_file', input: { file_path: '/tmp/output/report.md', content: '# Hi' } })]));
    expect(recordedDownloadName(files[0]!.operations[0]!)).toBe('report.md');
  });
  it('treats malformed text results as unavailable, while retaining valid text blocks', () => {
    const files = extractRecordedFiles(state([], [live({ name: 'file_read', content: [null, { type: 'text', text: 7 }, { type: 'text', text: 'ok' }] })]));
    expect(files[0]?.operations[0]?.text).toBe('ok');
    expect(extractRecordedFiles(state([], [live({ name: 'file_read', content: [] })]))[0]?.operations[0]?.text).toBeUndefined();
  });
});
