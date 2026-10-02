/**
 * The connect screen shown without an API (mekaweb's Welcome + ConnectionForm
 * logic, dsh-styled): brand column, saved-connection rows (click to connect,
 * trash to remove), and the endpoint/token/remember form. Connecting goes
 * through runtime.save / runtime.connect; failures render below the form.
 */
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useConnection, useRuntime, useSettings } from '../../connections/context';
import type { Connection } from '../../connections/storage';
import { errorMessage } from '../../api/client';
import { useAction } from '../../lib/actions';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Switch } from '../primitives/Switch';
import { Modal } from '../primitives/Modal';
import { IconTrashOutlineRegular } from '../icons';
import { useDialogState } from '../shell/use-dialog-state';
import css from './Welcome.module.css';

/** Endpoint, token, and token-storage form; prefilled when editing a saved row. */
function ConnectionForm({ existing }: { existing?: Connection | undefined }) {
  const runtime = useRuntime();
  const state = useConnection();
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? '');
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(existing?.remember ?? true);
  const connectButton = useRef<HTMLButtonElement>(null);
  const action = useAction();
  const busy = state.busy || action.busy;
  const failure = action.error ?? (state.error ? new Error(state.error) : undefined);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const ok = await runtime.save(existing?.name ?? '', endpoint, token, remember, existing?.id);
      if (ok) setToken('');
    });
  }
  return (
    <form className={css.formStack} onSubmit={(event) => void submit(event)}>
      <label className={css.field}>
        Server URL
        <Input
          className={css.fieldInput ?? ''}
          type="url"
          required
          value={endpoint}
          placeholder="https://meka.example.com"
          autoComplete="url"
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <label className={css.field}>
        API token
        <Input
          className={css.fieldInput ?? ''}
          type="password"
          required
          value={token}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <div className={css.switchRow}>
        <span className={css.switchText}>
          Remember me
          <span className={css.switchHint}>
            {remember ? 'Token persists in this browser.' : 'Token clears when this tab closes.'}
          </span>
        </span>
        <Switch
          checked={remember}
          onChange={setRemember}
          label="Remember me"
          title={remember ? 'Store the token in local storage' : 'Keep the token in session storage only'}
        />
      </div>
      {failure !== undefined && (
        <p className={css.errorText} role="alert">
          {errorMessage(failure)}
        </p>
      )}
      <div className={css.actions}>
        <Button ref={connectButton} variant="primary" type="submit" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
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
      </div>
    </form>
  );
}

/** Confirmation for forgetting a saved connection row. */
function RemoveDialog({
  connection,
  onClose,
}: {
  connection: Connection | undefined;
  onClose: () => void;
}) {
  const runtime = useRuntime();
  useDialogState(css.removeDialog, connection !== undefined);
  return (
    <Modal
      open={connection !== undefined}
      onClose={onClose}
      title="Remove connection"
      closeLabel="Close"
      className={css.removeDialog ?? ''}
      description="Remove this endpoint, its saved token, and local drafts. Server data is unaffected."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            data-modal-autofocus
            onClick={() => {
              if (connection) runtime.storage.remove(connection.id);
              onClose();
            }}
          >
            Remove
          </Button>
        </>
      }
    />
  );
}

export function Welcome() {
  const settings = useSettings();
  const runtime = useRuntime();
  const [existing, setExisting] = useState<Connection>();
  const [removing, setRemoving] = useState<Connection>();
  return (
    <main className={css.welcome}>
      <div className={css.brand}>
        <img src={import.meta.env.BASE_URL + 'meka.webp'} alt="" width={64} height={64} />
        <h1 className={css.wordmark}>mekadsh</h1>
        <p className={css.caption}>Connect to a meka server</p>
      </div>
      <section className={css.card} aria-label="Connect to meka">
        {settings.connections.length > 0 && (
          <div className={css.savedList}>
            {settings.connections.map((connection) => {
              let host = connection.endpoint;
              try {
                host = new URL(connection.endpoint).host;
              } catch {
                /* Stored endpoints are normalized; show the raw value if one is not. */
              }
              return (
                <div key={connection.id} className={css.savedRow}>
                  <button
                    type="button"
                    className={css.savedConnect}
                    title={`Connect to ${connection.name}`}
                    onClick={() => {
                      if (runtime.storage.token(connection)) void runtime.connect(connection);
                      else {
                        runtime.cancelConnect();
                        setExisting(connection);
                      }
                    }}
                  >
                    <span className={css.savedName}>{connection.name}</span>
                    <span className={css.savedHost}>{host}</span>
                  </button>
                  <button
                    type="button"
                    className={css.forgetButton}
                    aria-label={`Remove connection: ${connection.name}`}
                    title="Remove connection"
                    aria-haspopup="dialog"
                    onClick={() => setRemoving(connection)}
                  >
                    <IconTrashOutlineRegular size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <ConnectionForm key={existing?.id ?? 'new'} existing={existing} />
      </section>
      {runtime.storage.warning && (
        <p className={css.storageWarning} role="status">
          {runtime.storage.warning}
        </p>
      )}
      <RemoveDialog connection={removing} onClose={() => setRemoving(undefined)} />
    </main>
  );
}
