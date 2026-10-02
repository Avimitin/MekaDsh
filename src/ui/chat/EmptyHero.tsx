import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { errorMessage, type Schema } from '../../api/client';
import { useCan, useResource, useRuntime } from '../../connections/context';
import { useSessionNavigation } from '../../features/session-navigation';
import { directoryLabel, recentDirectories, sameDirectory } from '../../features/working-directory';
import { Composer } from '../composer/Composer';
import { NoticeRow } from './NoticeRow';
import { useDismissOnOutsidePointer } from '../primitives/useDismissOnOutsidePointer';
import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconGlobeOutlineRegular,
} from '../icons';
import { cn } from '../../lib/cn';
import css from './EmptyHero.module.css';

/** New-conversation hero: brand headline, working-directory chip row, and the hero composer. */
export function EmptyHero() {
  const runtime = useRuntime();
  const { newConversation: creation, setMobileSessionsOpen } = useSessionNavigation();
  const canWrite = useCan('sessions:w');
  return (
    <div className={css.heroScroll}>
      <div className={css.heroColumn}>
        <div className={css.headline}>
          <span className={css.logoHitbox}>
            <img
              className={css.logo}
              src={import.meta.env.BASE_URL + 'meka.webp'}
              width={64}
              height={64}
              alt=""
            />
          </span>
          <h1 className={css.title}>How can I help?</h1>
        </div>
        {!canWrite && <p className={css.readonly}>This connection is read only.</p>}
        {creation.uncertain ? (
          <div className={css.recovery}>
            <NoticeRow
              level="warn"
              text="Session creation wasn't confirmed, so the server may have created it. Check the session list before trying again."
            />
            <div className={css.recoveryActions}>
              <button
                type="button"
                className={css.recoveryButton}
                onClick={() => {
                  runtime.storage.layout({ sessionsCollapsed: false });
                  setMobileSessionsOpen(true);
                }}
              >
                Show sessions
              </button>
              <button
                type="button"
                className={cn(css.recoveryButton, css.recoveryGhost)}
                onClick={creation.acknowledge}
              >
                I reviewed the session list
              </button>
            </div>
          </div>
        ) : creation.error !== undefined && creation.error !== null ? (
          <p className={css.error} role="alert">
            {errorMessage(creation.error)}
          </p>
        ) : null}
        <WorkingDirectoryPicker
          value={creation.settings.cwd}
          disabled={!canWrite || creation.busy}
          onChange={(cwd) => creation.setSettings({ ...creation.settings, cwd })}
        />
        <Composer variant="hero" />
      </div>
    </div>
  );
}

/** Free-form path input plus recent directories, as a compact chip row above the hero composer. */
function WorkingDirectoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const canRead = useCan('sessions:r');
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const recentId = useId();
  const root = useRef<HTMLSpanElement>(null);
  useDismissOnOutsidePointer(root, open, setOpen);
  // Fetched once for suggestions; session creation invalidates it, so it needs no polling.
  const sessions = useResource<Schema['ListSessionsResponse']>(
    '/v1/sessions',
    { limit: 50 },
    canRead,
    0,
  );
  const recent = recentDirectories(sessions.data?.sessions ?? []);
  const current = value.trim();
  function choose(path: string) {
    onChange(path);
    setOpen(false);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, button'));
    const index = items.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    items[Math.min(items.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }
  return (
    <span ref={root} className={css.picker}>
      <button
        type="button"
        className={css.workspace}
        disabled={disabled}
        aria-label={`Working directory: ${current || 'server default'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={current || 'Server default working directory'}
        onClick={() => setOpen((shown) => !shown)}
      >
        {current ? (
          <IconFolderOpenRegular className={css.folder} size={16} />
        ) : (
          <IconFolderCloseRegular className={css.folder} size={16} />
        )}
        <span className={css.workspaceLabel}>
          {current ? directoryLabel(current).name : 'Default directory'}
        </span>
        <IconChevronDownOutlineRegular className={css.chevron} size={12} />
      </button>
      {open && (
        <div className={css.directoryCard} role="dialog" aria-label="Working directory" onKeyDown={navigate}>
          <form
            className={css.directoryForm}
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          >
            <label htmlFor={inputId}>Working directory</label>
            <input
              id={inputId}
              value={value}
              placeholder="Absolute server path"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => onChange(event.target.value)}
            />
          </form>
          <DirectoryOption
            icon={<IconGlobeOutlineRegular size={15} />}
            name="Server default"
            detail="meka's current directory"
            selected={!current}
            onSelect={() => choose('')}
          />
          {recent.length > 0 && (
            <div role="group" aria-labelledby={recentId}>
              <div className={css.directorySection} id={recentId}>
                Recent
              </div>
              {recent.map((path) => {
                const { name, parent } = directoryLabel(path);
                return (
                  <DirectoryOption
                    key={path}
                    icon={<IconFolderCloseRegular size={15} />}
                    name={name}
                    detail={parent}
                    label={path}
                    selected={sameDirectory(current, path)}
                    onSelect={() => choose(path)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function DirectoryOption({
  icon,
  name,
  detail,
  label,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  label?: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={css.directoryOption}
      data-selected={selected || undefined}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onSelect}
    >
      {icon}
      <span className={css.optionText}>
        <span>{name}</span>
        {detail && <small>{detail}</small>}
      </span>
      {selected && <IconCheckOutlineRegular className={css.optionCheck} size={14} />}
    </button>
  );
}
