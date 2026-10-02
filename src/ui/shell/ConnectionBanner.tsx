/**
 * Connection-lost banner (mekaweb's connection-banner logic, dsh styling): a
 * slim live-region card pinned top-center of the center column while the
 * runtime reports a connection issue, with a manual retry on top of the
 * runtime's automatic recovery.
 */
import { useConnection, useRuntime } from '../../connections/context';
import { Button } from '../primitives/Button';
import { IconRefreshOutlineRegular, IconWarningTriangleOutlineRegular } from '../icons';
import css from './ConnectionBanner.module.css';

export function ConnectionBanner() {
  const state = useConnection();
  const runtime = useRuntime();
  if (!state.api || !state.connectionIssue) return null;
  const checking = state.connectionIssue === 'checking';
  return (
    <div className={css.banner} role="status">
      <span className={css.icon} aria-hidden="true">
        <IconWarningTriangleOutlineRegular size={14} />
      </span>
      <span className={css.message} title={state.connection?.name}>
        Connection lost.<span className="sr-only"> Retrying automatically.</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={css.retry}
        aria-label="Retry connection"
        aria-busy={checking}
        disabled={checking}
        icon={
          <span className={checking ? css.spin : undefined} aria-hidden="true">
            <IconRefreshOutlineRegular size={14} />
          </span>
        }
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => void runtime.retryConnection()}
      >
        Retry
      </Button>
    </div>
  );
}
