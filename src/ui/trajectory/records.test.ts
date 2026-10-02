import { describe, expect, it } from 'vitest';
import type { Schema } from '../../api/client';
import type { LiveTool, SessionState, Submission } from '../../session/controller';
import { filterRecords, trajectoryRecords } from './records';

const call = (id = 'call', command = 'pwd'): Schema['ContentBlockView'] => ({
  type: 'tool_use', id, name: 'shell_execute', input: { command },
});
const result = (id = 'call', text = '/workspace', is_error = false): Schema['ContentBlockView'] => ({
  type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }], is_error,
});
const message = (role: string, ...content: Schema['ContentBlockView'][]): Schema['MessageView'] => ({ role, content });
const state = (messages: Schema['MessageView'][] = [], rest: Partial<SessionState> = {}): SessionState => ({
  id: 'session', feed: 'connected', offset: 0, loading: false, deleting: false, settingsPending: false,
  running: false, compacting: false, textStreaming: false, partial: false, blocks: [], tools: {}, approvals: [],
  notices: [], submissions: [], revision: 0, lastTurn: undefined,
  saved: { messages, revision: 0, total: messages.length, session_id: 'session' }, ...rest,
});
const liveTool: LiveTool = { id: 'call', name: 'shell_execute', input: { command: 'pwd' },
  state: 'executing', output: 'streaming output', content: [], activity: '', progress: '' };
const submission: Submission = { key: 'submission', kind: 'turn', body: { message: 'Hello' },
  createdAt: '2026-10-02T12:00:00Z', preview: true, state: 'running' };

describe('execution records', () => {
  it('pairs tool results without moving the call from its chronological position', () => {
    const records = trajectoryRecords(state([
      message('user', { type: 'text', text: 'Run pwd' }),
      message('assistant', { type: 'thinking', thinking: 'Checking directory' }, call()),
      message('user', result()),
      message('assistant', { type: 'text', text: 'Done' }),
    ]));
    expect(records.map((record) => record.kind)).toEqual(['user', 'thinking', 'tool', 'assistant']);
    expect(records[2]).toMatchObject({ title: 'shell_execute', status: 'Completed',
      sections: [{ label: 'Input', text: '{\n  "command": "pwd"\n}' }, { label: 'Result', text: '/workspace' }],
    });
  });

  it('keeps reused tool IDs in separate rounds with their own results', () => {
    const records = trajectoryRecords(state([
      message('assistant', call()), message('user', result('call', 'first')),
      message('assistant', call('call', 'ls')), message('user', result('call', 'second', true)),
    ]));
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.sections[1]?.text)).toEqual(['first', 'second']);
    expect(records.map((record) => record.failed)).toEqual([false, true]);
  });

  it('preserves orphaned and ambiguous tool results without inventing success', () => {
    const records = trajectoryRecords(state([
      message('user', result('missing')),
      message('assistant', call(), call()),
      message('user', result()),
    ]));
    expect(records).toHaveLength(4);
    expect(records.map((record) => record.status)).toEqual(['Completed', 'Result unavailable', 'Result unavailable', 'Completed']);
    expect(records.filter((record) => record.title === 'Unpaired tool result')).toHaveLength(2);
  });

  it('does not pair calls across a compaction boundary and retains the summary', () => {
    const records = trajectoryRecords(state([
      message('assistant', call()),
      { ...message('user', { type: 'text', text: 'Earlier work summary' }), compaction: { generation: 2, replaced_count: 8 } },
      message('user', result()),
    ]));
    expect(records.map((record) => record.kind)).toEqual(['tool', 'compaction', 'tool']);
    expect(records[0]?.status).toBe('Result unavailable');
    expect(records[1]?.sections[1]?.text).toBe('Earlier work summary');
  });

  it('preserves identical messages and saved/live tools reusing the same ID', () => {
    const records = trajectoryRecords(state([
      message('user', { type: 'text', text: 'Again' }), message('user', { type: 'text', text: 'Again' }),
      message('assistant', call()), message('user', result()),
    ], { blocks: [{ kind: 'tool', id: 'call' }], tools: { call: liveTool } }));
    expect(records).toHaveLength(4);
    expect(new Set(records.map((record) => record.key)).size).toBe(4);
    expect(records.at(-1)?.status).toBe('Running');
  });

  it('shows each live tool and preview receipt once and respects reconciled receipts', () => {
    const records = trajectoryRecords(state([], {
      blocks: [{ kind: 'submission', key: 'submission' }, { kind: 'submission', key: 'submission' },
        { kind: 'tool', id: 'call' }, { kind: 'tool', id: 'call' }, { kind: 'submission', key: 'saved' }],
      submissions: [submission, { ...submission, key: 'saved', preview: false }], tools: { call: liveTool },
    }));
    expect(records.map((record) => record.kind)).toEqual(['user', 'tool']);
    expect(records[0]?.timestampLabel).toBe('Submitted');
    expect(records[1]?.sections[1]?.text).toBe('streaming output');
  });

  it('replaces live records with saved records on the controller reconciliation transition', () => {
    const before = state([], { blocks: [{ kind: 'submission', key: 'submission' }, { kind: 'text', text: 'Done' }], submissions: [submission] });
    const after = state([
      message('user', { type: 'text', text: 'Hello' }), message('assistant', { type: 'text', text: 'Done' }),
    ], { submissions: [{ ...submission, preview: false, state: 'completed' }] });
    expect(trajectoryRecords(before).map((record) => record.preview)).toEqual(['Hello', 'Done']);
    expect(trajectoryRecords(after).map((record) => record.preview)).toEqual(['Hello', 'Done']);
    expect(trajectoryRecords(after).every((record) => !record.live)).toBe(true);
  });

  it('includes context, images, and redacted reasoning without presenting absent content', () => {
    const records = trajectoryRecords(state([
      message('user', { type: 'turn_context', text: 'cwd: /workspace' }, { type: 'image', media_type: 'image/png', hash: 'image-hash' }),
      message('assistant', { type: 'redacted_thinking' }),
      message('user', { type: 'tool_result', tool_use_id: 'screenshot', is_error: false,
        content: [{ type: 'image', media_type: 'image/jpeg', hash: 'tool-image' }] }),
    ]));
    expect(records.map((record) => record.kind)).toEqual(['context', 'user', 'thinking', 'tool']);
    expect(records[2]?.preview).toContain('redacted');
    expect(records[3]?.sections[0]?.text).toContain('tool-image');
  });

  it('records only valid source timestamps without assigning execution durations', () => {
    const records = trajectoryRecords(state([
      { ...message('user', { type: 'text', text: 'First' }), created_at: '2026-10-02T12:00:00Z' },
      { ...message('assistant', { type: 'text', text: 'Second' }), created_at: 'invalid' },
      message('assistant', call()),
    ]));
    expect(records.map((record) => record.timestamp)).toEqual(['2026-10-02T12:00:00Z', undefined, undefined]);
    expect(records[0]?.timestampLabel).toBe('Saved');
    expect(records.every((record) => !('duration' in record))).toBe(true);
  });

  it('uses settled result content after streaming, including errors and progress', () => {
    const records = trajectoryRecords(state([], { blocks: [{ kind: 'tool', id: 'call' }], tools: {
      call: { ...liveTool, state: 'error', content: [{ type: 'text', text: 'Permission denied' }], activity: 'Delegated task', progress: '2 / 4' },
    } }));
    expect(records[0]).toMatchObject({ failed: true, status: 'Failed' });
    expect(records[0]?.sections.map((section) => section.text)).toEqual([
      '{\n  "command": "pwd"\n}', 'Permission denied', 'Delegated task', '2 / 4',
    ]);
  });

  it('does not put image bytes in the live JSON inspector', () => {
    const records = trajectoryRecords(state([], { blocks: [{ kind: 'submission', key: 'submission' }], submissions: [
      { ...submission, body: { message: 'Describe', images: [{ media_type: 'image/png', data: 'BASE64_PAYLOAD' }] } },
    ] }));
    expect(JSON.stringify(records)).not.toContain('BASE64_PAYLOAD');
    expect(records[0]?.preview).toContain('[Image: image/png]');
  });

  it('keeps saved keys stable when an earlier page is prepended', () => {
    const last = message('user', { type: 'text', text: 'last' });
    const before = trajectoryRecords(state([last], { offset: 1 }));
    const after = trajectoryRecords(state([message('user', { type: 'text', text: 'earlier' }), last]));
    expect(before[0]?.key).toBe(after[1]?.key);
  });
});

it('combines category, error, and case-insensitive multi-term searches across input and output', () => {
  const records = trajectoryRecords(state([
    message('assistant', call('ok', 'echo ready')), message('user', result('ok', 'ready')),
    message('assistant', call('error', 'cat missing.txt')), message('user', result('error', 'Permission denied', true)),
    message('assistant', { type: 'text', text: 'Permission denied from cat' }),
  ]));
  expect(filterRecords(records, ' CAT   denied ', 'tool', true)).toHaveLength(1);
  expect(filterRecords(records, 'denied', 'all', false)).toHaveLength(2);
  expect(filterRecords(records, '', 'assistant', true)).toHaveLength(0);
  expect(filterRecords(records, 'absent', 'all', false)).toHaveLength(0);
});
