/**
 * Approval tray (mekaweb's ApprovalCard logic, dsh approval visual language):
 * pending approvals for every session EXCEPT the one on the current route —
 * the open session's approvals render in its own composer area. Cards stack
 * bottom-right; answering goes through controller.respond with busy and error
 * state per card.
 */
import { useLocation } from '@tanstack/react-router';
import type { Schema } from '../../api/client';
import { errorMessage } from '../../api/client';
import { useConnection } from '../../connections/context';
import { useSessionStates } from '../../session/hooks';
import type { Approval } from '../../session/controller';
import { useAction } from '../../lib/actions';
import { Button } from '../primitives/Button';
import { JsonTree } from '../primitives/JsonTree';
import { IconShieldOutlineRegular } from '../icons';
import css from './ApprovalTray.module.css';

const outcomes = [
  ['allow', 'Allow once'],
  ['deny', 'Deny once'],
  ['allow_always', 'Always allow'],
  ['deny_always', 'Always deny'],
] satisfies [Schema['PermissionDecision'], string][];

const variants: Record<Schema['PermissionDecision'], 'primary' | 'outline' | 'ghost'> = {
  allow: 'primary',
  deny: 'outline',
  allow_always: 'ghost',
  deny_always: 'ghost',
};

function ApprovalCard({ approval }: { approval: Approval }) {
  const { controller, connection } = useConnection();
  const action = useAction();
  const canWrite = controller?.canWrite ?? false;
  const structured =
    typeof approval.input === 'object' && approval.input !== null
      ? (approval.input as object | unknown[])
      : undefined;
  return (
    <section className={css.card}>
      <header className={css.header}>
        <IconShieldOutlineRegular size={18} />
        <h2 className={css.headline}>Approval needed</h2>
      </header>
      <p className={css.context}>
        {connection?.name ?? 'meka'} ·{' '}
        <a href={`#/sessions/${encodeURIComponent(approval.sessionId)}`}>
          Session {approval.sessionId.slice(0, 8)}
        </a>
      </p>
      <h3 className={css.tool}>{approval.tool}</h3>
      <details className={css.arguments}>
        <summary>Full arguments</summary>
        <div className={css.argumentsBody}>
          {structured !== undefined ? (
            <JsonTree
              data={structured}
              label="Tool arguments"
              labels={{
                copyValue: 'Copy value',
                copyJson: 'Copy JSON',
                copyPath: 'Copy path',
                copyPrettyJson: 'Copy pretty JSON',
                copyCompactJson: 'Copy compact JSON',
                copied: 'Copied',
                copyFailed: 'Copy failed',
                collapseNode: 'Collapse node',
                expandNode: 'Expand node',
                copyButtonTitle: (actionName) => `Copy ${actionName}`,
              }}
            />
          ) : (
            <pre className={css.plainArguments}>{JSON.stringify(approval.input)}</pre>
          )}
        </div>
      </details>
      <p className={css.expiry}>Expires at {new Date(approval.expires).toLocaleTimeString()}.</p>
      {action.error !== undefined && (
        <p className={css.errorText} role="alert">
          {errorMessage(action.error)}
        </p>
      )}
      <div className={css.actions}>
        {outcomes.map(([outcome, label]) => (
          <Button
            key={outcome}
            variant={variants[outcome]}
            size="sm"
            disabled={action.busy || !canWrite}
            title={canWrite ? undefined : 'Requires sessions:w'}
            onClick={() => void action.run(async () => controller?.respond(approval, outcome))}
          >
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function ApprovalTray() {
  const sessions = useSessionStates();
  const location = useLocation();
  const approvals = sessions
    .flatMap((session) => session.approvals)
    .filter((approval) => location.pathname !== `/sessions/${approval.sessionId}`);
  if (approvals.length === 0) return null;
  return (
    <div className={css.tray} role="region" aria-label="Pending approvals">
      {approvals.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} />
      ))}
    </div>
  );
}
