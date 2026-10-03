// Shared layout and notice components for the settings-style pages: a scrolling
// center column of card sections, with the dsh settings row idiom throughout.

import { cloneElement, useId, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ApiError, ConnectionError, errorMessage } from '../../../api/client';
import { cn } from '../../../lib/cn';
import { relativeTime } from '../../primitives/relative-time';
import type { JsonTreeLabels } from '../../primitives/JsonTree';
import { IconLoadingOutlineRegular, IconWarningOutlineRegular } from '../../icons';
import css from './page.module.css';

export function Page({ compact = false, children }: { compact?: boolean; children: ReactNode }) {
  if (compact) return <div className={css.compact}>{children}</div>;
  return (
    <div className={css.page}>
      <div className={css.column}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <header className={css.header}>
      <div className={css.headerText}>
        <h1 className={css.title}>{title}</h1>
        {description && <p className={css.description}>{description}</p>}
      </div>
      {actions && <div className={css.headerActions}>{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <div className={css.sectionHeaderText}>
          <h2 className={css.sectionTitle}>{title}</h2>
          {description && <p className={css.sectionDescription}>{description}</p>}
        </div>
        {actions}
      </div>
      <div className={css.sectionBody}>{children}</div>
    </section>
  );
}

export function Row({
  label,
  description,
  control,
  flush = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** Drops the top hairline and padding for the first row directly under a section header. */
  flush?: boolean;
}) {
  return (
    <div className={cn(css.row, flush && css.rowFlush)}>
      <div className={css.rowText}>
        <div className={css.rowLabel}>{label}</div>
        {description !== undefined && description !== null && (
          <p className={css.rowDescription}>{description}</p>
        )}
      </div>
      {control && <div className={css.rowControl}>{control}</div>}
    </div>
  );
}

/** Padded section content for forms that do not use the label/control Row layout. */
export function SectionContent({ children }: { children: ReactNode }) {
  return <div className={css.sectionContent}>{children}</div>;
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return <div className={css.footer}>{children}</div>;
}

export function ErrorNotice({
  error,
  standalone = false,
}: {
  error: unknown;
  standalone?: boolean;
}) {
  if (error instanceof ConnectionError && error.reportedGlobally) return null;
  if (!error) return null;
  return (
    <div className={standalone ? css.errorNoticeStandalone : css.errorNotice} role="alert">
      <IconWarningOutlineRegular size={16} />
      <span>{errorMessage(error)}</span>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className={css.notice}>{children}</div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className={css.empty}>
      <p className={css.emptyTitle}>{title}</p>
      {hint && <p className={css.emptyHint}>{hint}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className={css.loading} role="status">
      <IconLoadingOutlineRegular size={16} className={css.spin} />
      {label}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  return (
    <div className={css.field}>
      <label className={css.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id, ...(hint ? { 'aria-describedby': id + '-hint' } : {}) })}
      {hint && (
        <p className={css.fieldHint} id={id + '-hint'}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} {...props} className={cn(css.textarea, props.className)} />;
}

export function DateTimeText({ value }: { value: string | null | undefined }) {
  if (!value) return <span className={css.muted}>Not reported</span>;
  return (
    <time className={css.time} dateTime={value} title={value}>
      {new Date(value).toLocaleString()}
    </time>
  );
}

const RELATIVE_UNITS = {
  now: () => 'now',
  minutes: (n: number) => `${n}min ago`,
  hours: (n: number) => `${n}h ago`,
  days: (n: number) => `${n}d ago`,
  months: (n: number) => `${n}mo ago`,
  years: (n: number) => `${n}y ago`,
} as const;

export function RelativeDateTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span className={css.muted}>Not reported</span>;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return <span className={css.muted}>Not reported</span>;
  const bucket = relativeTime(at, Date.now());
  return (
    <time className={css.time} dateTime={value} title={new Date(value).toLocaleString()}>
      {RELATIVE_UNITS[bucket.unit](bucket.n)}
    </time>
  );
}

/** meka 409s reads for a session it has not loaded when the token may not write. */
export function isSessionNotLoaded(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.is('session-not-loaded');
}

/** Hardcoded English JsonTree copy; the primitive takes its labels by prop. */
export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: 'Copy value',
  copyJson: 'Copy JSON',
  copyPath: 'Copy path',
  copyPrettyJson: 'Copy pretty-printed JSON',
  copyCompactJson: 'Copy compact JSON',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  collapseNode: 'Collapse node',
  expandNode: 'Expand node',
  copyButtonTitle: (action: string) => `Copy: ${action}`,
};
