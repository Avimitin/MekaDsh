import { JsonTree, type JsonTreeLabels } from '../../primitives/JsonTree';
import type { ToolCallView } from '../ToolRow';
import { contentBlocks, isRecord } from './tool-content';
import css from './toolviews.module.css';

const jsonLabels: JsonTreeLabels = {
  copyValue: 'Copy value',
  copyJson: 'Copy JSON',
  copyPath: 'Copy path',
  copyPrettyJson: 'Copy pretty JSON',
  copyCompactJson: 'Copy compact JSON',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  collapseNode: 'Collapse node',
  expandNode: 'Expand node',
  copyButtonTitle: (action) => action,
};

function inputJson(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  try {
    return JSON.stringify(input, null, 2) ?? undefined;
  } catch {
    return String(input);
  }
}

/**
 * The default expanded body: an "Input" section (the call's arguments as a
 * JSON tree) and an "Output"/"Result" section — the streamed output while the
 * call runs, else the settled content blocks (text rendered, images noted as
 * chips; the bytes load through ImageAttachment where the composition layer
 * knows the session).
 */
export function GenericCard({ call }: { call: ToolCallView }) {
  const running = call.state === 'composing' || call.state === 'executing';
  const blocks = contentBlocks(call.content);
  const inputIsTree = isRecord(call.input) || Array.isArray(call.input);
  const inputFallback = inputIsTree ? undefined : inputJson(call.input);
  const hasInput = inputIsTree || inputFallback !== undefined;
  const hasOutput = running ? call.output !== '' : blocks.length > 0 || call.output !== '';
  if (!hasInput && !hasOutput) return null;
  return (
    <div className={css.ioCard}>
      {hasInput && (
        <div className={css.ioSection}>
          <span className={css.ioLabel}>Input</span>
          <span className={css.ioPayload}>
            {inputIsTree ? (
              <JsonTree data={call.input as object} label="Tool input" labels={jsonLabels} />
            ) : (
              <span className={css.ioText}>{inputFallback}</span>
            )}
          </span>
        </div>
      )}
      {hasInput && hasOutput && <span className={css.ioDivider} aria-hidden />}
      {hasOutput && (
        <div className={css.ioSection}>
          <span className={css.ioLabel}>{running ? 'Output' : 'Result'}</span>
          <span className={css.ioPayload}>
            {running || blocks.length === 0 ? (
              <span className={css.ioText} data-error={call.state === 'error' || undefined}>
                {call.output}
              </span>
            ) : (
              blocks.map((block, index) =>
                block.type === 'text' ? (
                  <span
                    className={css.ioText}
                    data-error={call.state === 'error' || undefined}
                    key={index}
                  >
                    {block.text}
                  </span>
                ) : block.type === 'image' ? (
                  <span className={css.imageChip} key={index}>
                    Image output{block.media_type ? ` (${block.media_type})` : ''}
                  </span>
                ) : null,
              )
            )}
          </span>
        </div>
      )}
    </div>
  );
}
