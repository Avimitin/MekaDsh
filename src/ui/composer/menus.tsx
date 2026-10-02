import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Schema } from '../../api/client';
import type { ComposerOptions } from '../../session/controller';
import { cn } from '../../lib/cn';
import { Menu } from '../primitives/Menu';
import type { MenuEntry } from '../primitives/Menu';
import { useAnchoredPosition } from '../primitives/useAnchoredPosition';
import { useDismissOnOutsidePointer } from '../primitives/useDismissOnOutsidePointer';
import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconDataOutlineRegular,
  IconPlusOutlineMedium,
  IconSettingsOutlineMedium,
  IconShieldOutlineRegular,
} from '../icons';
import css from './Composer.module.css';

/** Menu label copy: a name line with an optional caption line under it. */
function menuCopy(name: string, caption?: string): ReactNode {
  return (
    <span className={css.menuItemCopy}>
      <span className={css.menuItemName}>{name}</span>
      {caption ? <span className={css.menuItemCaption}>{caption}</span> : null}
    </span>
  );
}

/** The composer's "+" seat: the installed skill palette as an anchored menu. */
export function SkillsMenu({
  skills,
  value,
  disabled,
  onPick,
}: {
  skills: Schema['SkillView'][];
  value: string;
  disabled: boolean;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const items: MenuEntry[] = skills.map((skill) => ({
    id: skill.name,
    label: menuCopy(skill.name, skill.description),
  }));
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      side="top"
      align="start"
      portal
      autoFocus
      items={items}
      selectedId={value || undefined}
      onSelect={(id) => {
        onPick(id);
        setOpen(false);
      }}
      anchor={
        <button
          type="button"
          className={css.add}
          aria-label="Skills"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Skills"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <IconPlusOutlineMedium size={14} />
        </button>
      }
    />
  );
}

interface PermissionLevel {
  value: string;
  label: string;
  description: string;
}

/** meka's four permission levels, in Shift+Tab cycle order. */
export const PERMISSION_LEVELS: PermissionLevel[] = [
  { value: 'none', label: 'None', description: 'No file or shell access.' },
  { value: 'read', label: 'Read', description: 'Read files without changing anything.' },
  { value: 'workspace', label: 'Workspace', description: 'Work inside the project directory.' },
  { value: 'unrestricted', label: 'Unrestricted', description: 'Full access without limits.' },
];

/** The permission pill: shield icon, current level, and a menu of the four levels. */
export function PermissionPill({
  value,
  enabled,
  disabled,
  busy,
  onChange,
}: {
  value: string | undefined;
  /** Levels the server allows choosing (info.enabled_permissions). */
  enabled: string[];
  disabled: boolean;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const known = PERMISSION_LEVELS.some((level) => level.value === value);
  const items: MenuEntry[] = [
    ...(value && !known
      ? [{ id: value, label: menuCopy(value), disabled: true } satisfies MenuEntry]
      : []),
    ...PERMISSION_LEVELS.map(
      (level): MenuEntry => ({
        id: level.value,
        label: menuCopy(level.label, level.description),
        disabled: !enabled.includes(level.value),
      }),
    ),
  ];
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      side="top"
      align="start"
      portal
      autoFocus
      items={items}
      selectedId={value}
      onSelect={(id) => {
        onChange(id);
        setOpen(false);
      }}
      anchor={
        <button
          type="button"
          className={css.pill}
          aria-label={`Permission mode: ${value ?? 'not reported'}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-busy={busy || undefined}
          title={`Permission mode: ${value ?? 'not reported'} (Shift+Tab in message input)`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={css.pillIcon} aria-hidden="true">
            <IconShieldOutlineRegular size={14} />
          </span>
          <span className={css.pillLabel}>{value ?? 'Not reported'}</span>
          <span
            className={cn(css.pillIcon, css.pillChevron, open && css.pillChevronOpen)}
            aria-hidden="true"
          >
            <IconChevronDownOutlineRegular size={12} />
          </span>
        </button>
      }
    />
  );
}

/** The profile pill: model icon, profile name, and a menu of the server's profiles. */
export function ProfilePill({
  value,
  profiles,
  disabled,
  busy,
  locked,
  onChange,
}: {
  value: string | undefined;
  profiles: Schema['ProfileView'][];
  disabled: boolean;
  busy: boolean;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = profiles.find((profile) => profile.active)?.name;
  const missing = value && !profiles.some((profile) => profile.name === value);
  const items: MenuEntry[] = [
    ...(missing && value ? [{ id: value, label: menuCopy(value), disabled: true }] : []),
    ...profiles.map((profile) => ({
      id: profile.name,
      label: menuCopy(
        profile.name,
        [profile.account, profile.model].filter(Boolean).join(' · ') || undefined,
      ),
    })),
  ];
  const selected = [...new Set([value, active].filter((v): v is string => Boolean(v)))];
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      side="top"
      align="start"
      portal
      autoFocus
      items={items}
      selectedIds={selected}
      onSelect={(id) => {
        onChange(id);
        setOpen(false);
      }}
      anchor={
        <button
          type="button"
          className={cn(css.pill, css.pillCollapse)}
          aria-label={`Profile: ${value ?? 'not reported'}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-busy={busy || undefined}
          title={`Profile: ${value ?? 'not reported'}${locked ? ' (available when idle)' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={css.pillIcon} aria-hidden="true">
            <IconDataOutlineRegular size={14} />
          </span>
          <span className={css.pillLabel}>{value ?? 'Profile'}</span>
          <span
            className={cn(css.pillIcon, css.pillChevron, open && css.pillChevronOpen)}
            aria-hidden="true"
          >
            <IconChevronDownOutlineRegular size={12} />
          </span>
        </button>
      }
    />
  );
}

const DELIVERY_OPTIONS = [
  {
    value: 'steer',
    label: 'Steer',
    description: 'Reaches the agent between tool calls in the current turn.',
  },
  {
    value: 'followup',
    label: 'Queue',
    description: 'Runs right after the current turn finishes.',
  },
  {
    value: 'interrupt',
    label: 'Interrupt',
    description: 'Stops the current turn and sends this message now.',
  },
];

const RETENTION_OPTIONS = [
  {
    value: 'keep',
    label: 'Keep (server default)',
    description: 'An unanswered direct-turn message stays for the next turn.',
  },
  {
    value: 'withdraw',
    label: 'Withdraw',
    description: 'Take the message back if the turn ends without answering it.',
  },
];

function OptionRow({
  label,
  description,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={css.settingsOption}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className={css.settingsOptionCopy}>
        <span>{label}</span>
        <span className={css.settingsOptionCaption}>{description}</span>
      </span>
      <span className={css.settingsCheck} aria-hidden="true">
        {checked && <IconCheckOutlineRegular size={14} />}
      </span>
    </button>
  );
}

/** The gear popover: delivery class and retention for busy submissions, plus the inbox source. */
export function SettingsPopover({
  mode,
  retention,
  source,
  direct,
  disabled,
  fieldsDisabled,
  busy,
  onChange,
  approvals,
  onApprovalsChange,
  cwd,
  onCwdChange,
  cwdLocked,
}: {
  mode: string;
  retention: string;
  source: string;
  /** Images, a skill, or a non-keep retention force a direct turn: busy delivery cannot apply. */
  direct: boolean;
  /** The gear itself (no session yet, a save in flight, or a deleting session). */
  disabled: boolean;
  /** Every field (a read-only connection). */
  fieldsDisabled: boolean;
  busy: boolean;
  onChange: (patch: Partial<Pick<ComposerOptions, 'mode' | 'retention' | 'source'>>) => void;
  /** Session approval mode. Absent when approvals cannot be set here. */
  approvals?: boolean | undefined;
  onApprovalsChange?: ((value: boolean) => void) | undefined;
  /** Session working directory (existing sessions only; the hero edits cwd in the hero picker). */
  cwd?: string | undefined;
  onCwdChange?: ((value: string) => void) | undefined;
  /** meka locks the directory while a turn runs. */
  cwdLocked?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [cwdDraft, setCwdDraft] = useState(cwd ?? '');
  useEffect(() => {
    setCwdDraft(cwd ?? '');
  }, [cwd]);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    align: 'end',
    gap: 8,
    margin: 12,
  });
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return (
    <span ref={rootRef}>
      <button
        type="button"
        className={css.iconButton}
        aria-label="Composer settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={busy || undefined}
        title="Composer settings"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <IconSettingsOutlineMedium size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={css.settingsPanel}
            style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
            role="dialog"
            aria-label="Composer settings"
          >
            <div className={css.settingsSection}>
              <div className={css.settingsHeading}>While the agent is working</div>
              {direct && (
                <div className={css.settingsHint}>
                  Unavailable with the selected delivery options.
                </div>
              )}
              <div role="group" aria-label="While the agent is working">
                {DELIVERY_OPTIONS.map((option) => (
                  <OptionRow
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    checked={mode === option.value}
                    disabled={direct || fieldsDisabled}
                    onSelect={() => onChange({ mode: option.value })}
                  />
                ))}
              </div>
            </div>
            <div className={css.settingsSection}>
              <div className={css.settingsHeading}>Unanswered direct-turn message</div>
              <div role="group" aria-label="Unanswered direct-turn message">
                {RETENTION_OPTIONS.map((option) => (
                  <OptionRow
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    checked={retention === option.value}
                    disabled={fieldsDisabled}
                    onSelect={() => onChange({ retention: option.value })}
                  />
                ))}
              </div>
            </div>
            <div className={css.settingsSection}>
              <div className={css.settingsHeading}>Inbox source</div>
              <input
                className={css.settingsInput}
                value={source}
                placeholder="Server default"
                aria-label="Inbox source"
                disabled={direct || fieldsDisabled}
                onChange={(event) => onChange({ source: event.target.value })}
              />
            </div>
            {onApprovalsChange !== undefined && (
              <div className={css.settingsSection}>
                <div className={css.settingsHeading}>Approval mode</div>
                <div role="group" aria-label="Approval mode">
                  <OptionRow
                    label="Ask for approval"
                    description="Calls above the session's permission level prompt you here."
                    checked={approvals === true}
                    disabled={fieldsDisabled}
                    onSelect={() => onApprovalsChange(true)}
                  />
                  <OptionRow
                    label="Deny above permission level"
                    description="Calls above the session's permission level are refused."
                    checked={approvals === false}
                    disabled={fieldsDisabled}
                    onSelect={() => onApprovalsChange(false)}
                  />
                </div>
              </div>
            )}
            {onCwdChange !== undefined && (
              <div className={css.settingsSection}>
                <div className={css.settingsHeading}>Working directory</div>
                {cwdLocked && <div className={css.settingsHint}>Directory is locked during a turn.</div>}
                <input
                  className={css.settingsInput}
                  value={cwdDraft}
                  placeholder="Server default"
                  aria-label="Working directory"
                  disabled={fieldsDisabled || cwdLocked === true}
                  onChange={(event) => setCwdDraft(event.target.value)}
                  onBlur={() => {
                    if (cwdDraft !== (cwd ?? '')) onCwdChange(cwdDraft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (cwdDraft !== (cwd ?? '')) onCwdChange(cwdDraft);
                    }
                  }}
                />
              </div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
