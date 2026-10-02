import type { ToolCallView } from '../ToolRow';
import { inputString, isRecord } from './tool-content';
import css from './toolviews.module.css';

interface TodoItem {
  text: string;
  status: string;
}

const TODO_STATUSES = new Set(['pending', 'in_progress', 'completed', 'canceled']);

function statusOf(value: unknown): string {
  return typeof value === 'string' && TODO_STATUSES.has(value) ? value : 'pending';
}

/** The items a todo call displays: todo_write's list, else todo_edit's transitions. */
export function todoItems(input: unknown): { title?: string; items: TodoItem[] } {
  if (!isRecord(input)) return { items: [] };
  const title = inputString(input, 'title');
  if (Array.isArray(input.items)) {
    const items = input.items.flatMap((item): TodoItem[] => {
      if (typeof item === 'string') return item === '' ? [] : [{ text: item, status: 'pending' }];
      if (isRecord(item) && typeof item.text === 'string' && item.text !== '')
        return [{ text: item.text, status: statusOf(item.status) }];
      return [];
    });
    return { ...(title !== undefined ? { title } : {}), items };
  }
  if (isRecord(input.set)) {
    const set = input.set;
    const items = Object.keys(set)
      .sort((left, right) => Number(left) - Number(right))
      .flatMap((id): TodoItem[] => {
        const status = set[id];
        return typeof status === 'string' ? [{ text: `#${id}`, status: statusOf(status) }] : [];
      });
    return { items };
  }
  return { ...(title !== undefined ? { title } : {}), items: [] };
}

/**
 * todo_write/todo_edit's expanded body: the list title above one row per task,
 * a status dot standing in for the checkbox (dsh's checklist card shape).
 */
export function TodoView({ call }: { call: ToolCallView }) {
  const { title, items } = todoItems(call.input);
  if (items.length === 0 && title === undefined) return <p className={css.caption}>Empty task list</p>;
  return (
    <div className={css.card}>
      {title !== undefined && <div className={css.cardTitle}>{title}</div>}
      <ul className={css.todoList}>
        {items.map((item, index) => (
          <li className={css.todoRow} data-status={item.status} key={index}>
            <span className={css.todoDot} data-status={item.status} aria-hidden="true" />
            <span className={css.todoText}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
