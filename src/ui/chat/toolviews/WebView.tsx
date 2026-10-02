import type { ToolCallView } from '../ToolRow';
import { inputString, resultText } from './tool-content';
import css from './toolviews.module.css';

/**
 * web_fetch's expanded body: the fetched URL as an external link above the
 * page text the call returned.
 */
export function WebView({ call }: { call: ToolCallView }) {
  const url = inputString(call.input, 'url');
  const text = resultText(call);
  return (
    <div className={css.card}>
      {url !== undefined && (
        <div className={css.cardTitle}>
          <a className={css.resultLink} href={url} target="_blank" rel="noreferrer noopener">
            {url}
          </a>
        </div>
      )}
      {text === '' ? (
        <p className={css.caption}>No content</p>
      ) : (
        <pre className={css.bodyText} tabIndex={0}>
          {text}
        </pre>
      )}
    </div>
  );
}
