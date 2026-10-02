import type { ToolCallView } from '../ToolRow';
import { inputString, resultText } from './tool-content';
import css from './toolviews.module.css';

/**
 * shell_execute's expanded body: the command as a `$ …` banner and its output
 * scrolling inside the same code-block surface, capped like dsh's TerminalBlock.
 */
export function TerminalView({ call }: { call: ToolCallView }) {
  const command = inputString(call.input, 'command');
  const output = resultText(call);
  const failed = call.state === 'error';
  return (
    <div className={css.terminal} data-body={output !== '' || undefined}>
      <div className={css.terminalHeader}>
        <span className={css.terminalPrompt}>
          <span className={css.terminalDollar} aria-hidden="true">
            $
          </span>
          <span className={css.terminalCommand}>{command ?? ''}</span>
        </span>
      </div>
      {output !== '' && (
        <pre className={css.terminalOutput} data-error={failed || undefined} tabIndex={0}>
          {output}
        </pre>
      )}
    </div>
  );
}
