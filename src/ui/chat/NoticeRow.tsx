import { memo } from 'react';
import {
  IconInfoOutlineRegular,
  IconWarningOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '../icons/index';
import css from './NoticeRow.module.css';

const noticeIcons = {
  info: IconInfoOutlineRegular,
  warn: IconWarningTriangleOutlineRegular,
  error: IconWarningOutlineRegular,
} as const;

const noticeLabels = {
  info: 'Notice',
  warn: 'Warning',
  error: 'Error',
} as const;

/**
 * One inline conversation notice: a small level icon and caption text on the
 * state tokens (tertiary for info, warn/error colors for those levels).
 * Errors announce with role=alert; other levels with role=status.
 */
export const NoticeRow = memo(function NoticeRow({
  level,
  text,
}: {
  level: 'info' | 'warn' | 'error';
  text: string;
}) {
  const Icon = noticeIcons[level];
  return (
    <div className={css.notice} data-level={level} role={level === 'error' ? 'alert' : 'status'}>
      <span className={css.icon} aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className={css.text}>
        <strong className={css.label}>{noticeLabels[level]}</strong> {text}
      </span>
    </div>
  );
});
