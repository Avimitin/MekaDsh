// Port of mekaweb's ScheduleForm: prompt, timing (one-time, interval, cron),
// and an optional gate editor. Submits POST /v1/sessions/{id}/schedule.

import { useState, type FormEvent } from 'react';
import { useCan, useConnection } from '../../../connections/context';
import { sessionPath, type Schema } from '../../../api/client';
import { useAction } from '../../../lib/actions';
import { Button } from '../../primitives/Button';
import { Input } from '../../primitives/Input';
import { SegmentedTabs } from '../../primitives/SegmentedTabs';
import { ErrorNotice, Field, Textarea } from '../shared/page';
import css from './ScheduleForm.module.css';

type Timing = 'at' | 'every' | 'cron';
type GateKind = 'none' | 'shell' | 'tool';
type GateWhen = 'changed' | 'succeeded' | 'matches' | 'pointer';

const TIMING_TABS = [
  { value: 'at', label: 'One time', id: 'schedule-timing-at', panelId: 'schedule-timing-panel' },
  { value: 'every', label: 'Interval', id: 'schedule-timing-every', panelId: 'schedule-timing-panel' },
  { value: 'cron', label: 'Cron', id: 'schedule-timing-cron', panelId: 'schedule-timing-panel' },
] as const;

export function ScheduleForm({
  sessionId,
  onSaved,
}: {
  sessionId: string | undefined;
  onSaved: () => void;
}) {
  const { api } = useConnection();
  // A gate plants an unattended shell command or tool call on the session, so
  // the server also requires sessions:w for that part of the form.
  const canGate = useCan('sessions:w');
  const [id, setId] = useState(sessionId ?? '');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<Timing>('at');
  const [time, setTime] = useState('');
  const [gate, setGate] = useState<GateKind>('none');
  const [check, setCheck] = useState('');
  const [args, setArgs] = useState('{}');
  const [when, setWhen] = useState<GateWhen>('changed');
  const [pattern, setPattern] = useState('');
  const [pointer, setPointer] = useState('');
  const [condition, setCondition] = useState('not_empty');
  const action = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      let gateValue: Schema['CreateGate'] | undefined;
      if (gate !== 'none')
        gateValue = {
          check:
            gate === 'shell'
              ? { command: check }
              : { tool: check, arguments: JSON.parse(args) as unknown },
          when:
            when === 'matches'
              ? { matches: pattern }
              : when === 'pointer'
                ? { at: pointer, is: condition }
                : when,
        };
      await api?.mutate('POST', sessionPath(id) + '/schedule', {
        prompt,
        ...(kind === 'at' ? { at: time } : kind === 'every' ? { every: time } : { cron: time }),
        ...(gateValue ? { gate: gateValue } : {}),
      } satisfies Schema['CreateJobRequest']);
      onSaved();
    });
  }

  return (
    <form className={css.form} onSubmit={(event) => void submit(event)}>
      <Field label="Session ID">
        <Input
          required
          value={id}
          placeholder="Root session ID"
          readOnly={Boolean(sessionId)}
          disabled={action.busy}
          onChange={(event) => setId(event.target.value)}
        />
      </Field>
      <Field label="Prompt">
        <Textarea
          required
          value={prompt}
          disabled={action.busy}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>
      <div className={css.timing}>
        <SegmentedTabs
          items={[...TIMING_TABS]}
          value={kind}
          onChange={setKind}
          label="Timing"
          className={css.timingTabs}
        />
        <div id="schedule-timing-panel" role="tabpanel" aria-labelledby={`schedule-timing-${kind}`}>
          <Field
            label={kind === 'at' ? 'When' : kind === 'every' ? 'Interval' : 'Cron (server time)'}
          >
            <Input
              required
              value={time}
              disabled={action.busy}
              onChange={(event) => setTime(event.target.value)}
              placeholder={
                kind === 'at'
                  ? '20m or RFC 3339 timestamp'
                  : kind === 'every'
                    ? '30m or 6h'
                    : '0 9 * * 1-5'
              }
            />
          </Field>
        </div>
      </div>
      {canGate ? (
        <details className={css.gate}>
          <summary className={css.gateSummary}>Gate this schedule</summary>
          <div className={css.gateBody}>
            <Field label="Gate type">
              <select
                className={css.select}
                value={gate}
                disabled={action.busy}
                onChange={(event) => setGate(event.target.value as GateKind)}
              >
                <option value="none">No gate</option>
                <option value="shell">Shell command</option>
                <option value="tool">Read-only tool</option>
              </select>
            </Field>
            {gate !== 'none' && (
              <>
                <Field
                  label={gate === 'shell' ? 'Command' : 'Tool name'}
                  hint={gate === 'shell' ? 'Requires unrestricted permission.' : undefined}
                >
                  <Input
                    required
                    value={check}
                    disabled={action.busy}
                    placeholder={gate === 'shell' ? 'git status --porcelain' : 'mcp__server__tool'}
                    onChange={(event) => setCheck(event.target.value)}
                  />
                </Field>
                {gate === 'tool' && (
                  <Field label="Tool arguments (JSON)">
                    <Textarea
                      required
                      value={args}
                      disabled={action.busy}
                      onChange={(event) => setArgs(event.target.value)}
                    />
                  </Field>
                )}
                <Field label="Fire when">
                  <select
                    className={css.select}
                    value={when}
                    disabled={action.busy}
                    onChange={(event) => setWhen(event.target.value as GateWhen)}
                  >
                    <option value="changed">Result changes</option>
                    <option value="succeeded">Check succeeds</option>
                    <option value="matches">Output matches a regular expression</option>
                    <option value="pointer">JSON value meets a condition</option>
                  </select>
                </Field>
                {when === 'matches' && (
                  <Field label="Regular expression">
                    <Input
                      required
                      value={pattern}
                      disabled={action.busy}
                      onChange={(event) => setPattern(event.target.value)}
                    />
                  </Field>
                )}
                {when === 'pointer' && (
                  <>
                    <Field label="JSON pointer">
                      <Input
                        value={pointer}
                        disabled={action.busy}
                        placeholder="/items"
                        onChange={(event) => setPointer(event.target.value)}
                      />
                    </Field>
                    <Field label="Condition">
                      <select
                        className={css.select}
                        value={condition}
                        disabled={action.busy}
                        onChange={(event) => setCondition(event.target.value)}
                      >
                        <option value="not_empty">Not empty</option>
                        <option value="empty">Empty</option>
                        <option value="changed">Changed</option>
                      </select>
                    </Field>
                  </>
                )}
              </>
            )}
          </div>
        </details>
      ) : (
        <p className={css.gateNote}>Gating a schedule requires sessions:w.</p>
      )}
      <ErrorNotice error={action.error} standalone />
      <div className={css.actions}>
        <Button variant="primary" type="submit" disabled={action.busy}>
          {action.busy ? 'Creating…' : 'Create schedule'}
        </Button>
      </div>
    </form>
  );
}
