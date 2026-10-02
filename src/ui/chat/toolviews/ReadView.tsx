import type { CSSProperties } from 'react';
import type { ToolCallView } from '../ToolRow';
import { inputString, resultText } from './tool-content';
import css from './toolviews.module.css';

/**
 * file_read's expanded body: the read path above the returned text in a
 * numbered gutter (the numbers are presentation only and never copy).
 */
export function ReadView({ call }: { call: ToolCallView }) {
  const path = inputString(call.input, 'path');
  const text = resultText(call);
  const lines = text === '' ? [] : text.split('\n');
  return (
    <div className={css.card}>
      {path !== undefined && <div className={css.cardTitle}>{path}</div>}
      {lines.length === 0 ? (
        <p className={css.caption}>No output</p>
      ) : (
        <pre
          className={css.numbered}
          style={
            {
              '--meka-line-number-width': `${Math.max(2, String(lines.length).length)}ch`,
            } as CSSProperties
          }
          tabIndex={0}
        >
          <code>
            {lines.map((line, index) => (
              <span className={css.numberedLine} key={index}>
                {line}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}
