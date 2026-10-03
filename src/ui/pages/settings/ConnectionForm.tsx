// Port of mekaweb's ConnectionForm: name, base URL, token, and token storage
// choice, saving through the runtime so the connection verifies before it
// persists. Busy and error states surface inline, including cancel mid-connect.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDeploymentConfig } from '../../../features/files/hooks';
import { useConnection, useRuntime } from '../../../connections/context';
import type { Connection } from '../../../connections/storage';
import { normalizeEndpoint } from '../../../api/client';
import { useAction } from '../../../lib/actions';
import { Button } from '../../primitives/Button';
import { Input } from '../../primitives/Input';
import { IconLoadingOutlineRegular } from '../../icons';
import { ErrorNotice, Field } from '../shared/page';
import css from './ConnectionForm.module.css';

export function ConnectionForm({
  existing,
  onConnected,
}: {
  existing?: Connection | undefined;
  onConnected?: (() => void) | undefined;
}) {
  const runtime = useRuntime();
  const state = useConnection();
  const [name, setName] = useState(existing?.name ?? '');
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? '');
  const deployment = useDeploymentConfig();
  const endpointEdited = useRef(Boolean(existing));
  useEffect(() => {
    const suggested = deployment.data?.connections[0]?.apiBaseUrl;
    if (!endpointEdited.current && suggested) setEndpoint(suggested);
  }, [deployment.data]);
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(existing?.remember ?? true);
  const connectButton = useRef<HTMLButtonElement>(null);
  let endpointChanged = false;
  if (existing) {
    try {
      endpointChanged = normalizeEndpoint(endpoint) !== existing.endpoint;
    } catch {
      // A partially entered URL is not a new endpoint yet.
    }
  }
  const action = useAction();
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const ok = await runtime.save(name, endpoint, token, remember, existing?.id);
      if (ok) {
        setToken('');
        onConnected?.();
      }
    });
  }
  return (
    <form className={css.form} onSubmit={(event) => void submit(event)}>
      <Field label="Connection name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Personal meka"
          autoComplete="off"
        />
      </Field>
      <Field
        label="Meka base URL"
        hint={
          endpointChanged
            ? 'Changing the URL replaces this connection and clears its local drafts.'
            : undefined
        }
      >
        <Input
          type="url"
          required
          value={endpoint}
          onChange={(event) => { endpointEdited.current = true; setEndpoint(event.target.value); }}
          placeholder="https://meka.example.com"
          autoComplete="url"
        />
      </Field>
      <Field label="API token">
        <Input
          type="password"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Token storage">
        <select
          className={css.select}
          value={remember ? 'localStorage' : 'sessionStorage'}
          onChange={(event) => setRemember(event.target.value === 'localStorage')}
        >
          <option value="localStorage">Local storage (persistent)</option>
          <option value="sessionStorage">Session storage (this tab)</option>
        </select>
      </Field>
      <ErrorNotice error={action.error ?? (state.error ? new Error(state.error) : undefined)} standalone />
      <div className={css.actions}>
        {state.busy && (
          <Button
            variant="outline"
            aria-label="Cancel connection"
            onClick={() => {
              runtime.cancelConnect();
              requestAnimationFrame(() => connectButton.current?.focus());
            }}
          >
            Cancel
          </Button>
        )}
        <Button
          ref={connectButton}
          variant="primary"
          type="submit"
          disabled={state.busy || action.busy}
        >
          {state.busy ? (
            <span className={css.connecting}>
              <IconLoadingOutlineRegular size={14} className={css.spin} />
              Connecting…
            </span>
          ) : (
            'Connect'
          )}
        </Button>
      </div>
    </form>
  );
}
