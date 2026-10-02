import type { ToolCallView } from '../ToolRow';
import { inputString, resultText } from './tool-content';
import css from './toolviews.module.css';

/**
 * web_search's expanded body: the query above the result rows the call
 * returned (one text line per row).
 */
export function SearchView({ call }: { call: ToolCallView }) {
  const query = inputString(call.input, 'query');
  const text = resultText(call);
  const rows = text === '' ? [] : text.split('\n').filter((line) => line.trim() !== '');
  return (
    <div className={css.card}>
      {query !== undefined && <div className={css.cardTitle}>{query}</div>}
      {rows.length === 0 ? (
        <p className={css.caption}>No results</p>
      ) : (
        <ul className={css.resultList}>
          {rows.map((row, index) => (
            <li className={css.resultRow} key={index}>
              {row}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
