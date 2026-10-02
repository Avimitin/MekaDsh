import { useSyncExternalStore } from 'react';
import { errorMessage, type Schema } from '../../api/client';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { useSessionStates } from '../../session/hooks';
import {
  emptyComposerOptions,
  remainingComposerOptions,
} from '../../session/composer-options';
import { isSessionRunning, type ComposerOptions } from '../../session/controller';
import { useTextDraft } from '../../session/drafts';
import { useSessionNavigation } from '../../features/session-navigation';
import { useAction } from '../../lib/actions';
import { useShortcut } from '../../lib/use-shortcut';
import { cn } from '../../lib/cn';
import { toast } from '../primitives/toast-store';
import { ContextMeter } from './ContextMeter';
import { InputBar, type ComposerActionKind } from './InputBar';
import { QueuedDock } from './QueuedDock';
import { PERMISSION_LEVELS, PermissionPill, ProfilePill, SettingsPopover, SkillsMenu } from './menus';
import type { ComposerSuggestion } from './suggestions';
import css from './Composer.module.css';

function composerSuggestions({ skills, profiles, permissions, onSkill, onProfile, onPermission }: {
  skills: Schema['SkillView'][];
  profiles: Schema['ProfilesResponse']['profiles'];
  permissions: string[];
  onSkill?: ((name: string) => void) | undefined;
  onProfile?: ((name: string) => void) | undefined;
  onPermission?: ((permission: string) => void) | undefined;
}): ComposerSuggestion[] {
  return [
    ...(onSkill ? skills.map((skill): ComposerSuggestion => ({
      id: `skill:${skill.name}`, label: `/${skill.name}`, description: skill.description,
      group: 'Skills', pick: () => onSkill(skill.name),
    })) : []),
    ...(onProfile ? profiles.map((profile): ComposerSuggestion => ({
      id: `profile:${profile.name}`, label: `/profile:${profile.name}`, description: profile.model ?? 'Switch profile',
      group: 'Profiles', pick: () => onProfile(profile.name),
    })) : []),
    ...(onPermission ? permissions.map((permission): ComposerSuggestion => ({
      id: `permission:${permission}`, label: `/permission:${permission}`, description: 'Change permission mode',
      group: 'Permissions', pick: () => onPermission(permission),
    })) : []),
  ];
}

const subscribeToNothing = () => () => {};

const ACTION_LABELS: Record<ComposerActionKind, string> = {
  send: 'Send message',
  queue: 'Queue',
  steer: 'Steer',
  interrupt: 'Interrupt',
  stop: 'Stop current turn',
};

/** Announce attachment intake and submission failures through the shared toasts. */
function toastError(error: unknown) {
  if (error == null) return;
  toast(errorMessage(error));
}

/** The draft-conflict resolution row, shown above the capsule for either variant. */
function ConflictNotice({ draft }: { draft: ReturnType<typeof useTextDraft> }) {
  if (!draft.conflict) return null;
  return (
    <div className={css.conflictRow}>
      <p>This draft changed in another tab. Choose which version to keep.</p>
      <button type="button" className={css.conflictButton} onClick={() => draft.resolve(false)}>
        Keep mine
      </button>
      <button type="button" className={css.conflictButton} onClick={() => draft.resolve(true)}>
        Use other tab
      </button>
    </div>
  );
}

/** The composer over an open session: drafts, delivery options, queue dock, and context meter. */
function SessionComposer({
  sessionId,
  docked,
  autoFocus,
}: {
  sessionId: string;
  docked: boolean;
  autoFocus: boolean;
}) {
  const { controller, connection, info } = useConnection();
  const runtime = useRuntime();
  const state = useSessionStates().find((entry) => entry.id === sessionId);
  const canWrite = useCan('sessions:w');
  const canRead = useCan('sessions:r');
  const draft = useTextDraft(runtime.storage, connection?.id ?? '', sessionId);
  const options =
    useSyncExternalStore(controller?.subscribe ?? subscribeToNothing, () =>
      controller?.draft(sessionId),
    ) ?? emptyComposerOptions;
  const { images, skill, retention, mode, source } = options;
  function updateOptions(
    patch: Partial<ComposerOptions> | ((current: ComposerOptions) => Partial<ComposerOptions>),
  ) {
    const current = controller?.draft(sessionId) ?? emptyComposerOptions;
    controller?.saveDraft(sessionId, {
      ...current,
      ...(typeof patch === 'function' ? patch(current) : patch),
    });
  }
  const profiles = useResource<Schema['ProfilesResponse']>('/v1/profiles');
  const skills = useResource<Schema['SkillView'][]>('/v1/skills', undefined, canRead);
  const profileList = profiles.data?.profiles ?? [];
  const skillList = skills.data ?? [];

  const sendAction = useAction(toastError);
  const cancelAction = useAction(toastError);
  const settingsAction = useAction(toastError);

  const session = state?.session;
  const feed = state?.feed ?? 'connecting';
  const deleting = state?.deleting ?? false;
  const mutableSettings = canWrite && !session?.parent_id && Boolean(session) && !deleting;
  const permissions = info?.enabled_permissions ?? [];
  // Shift+Tab cycles the canonical level order, restricted to the server's enabled set.
  const cycleLevels = PERMISSION_LEVELS.map((level) => level.value).filter((level) =>
    permissions.includes(level),
  );
  const settingsSaving = settingsAction.busy || (state?.settingsPending ?? false);
  const permissionDisabled = !mutableSettings || settingsSaving;
  const running = state ? isSessionRunning(state) : false;
  const direct = images.length > 0 || Boolean(skill) || retention !== 'keep';
  const uncertain = state?.submissions.find((submission) => submission.state === 'uncertain');
  const pending = state?.submissions.some((submission) => submission.state === 'sending') ?? false;
  const hasText = Boolean(draft.text.trim());
  const hasMessage = hasText || images.length > 0 || Boolean(skill);
  const showStop = running && !hasText;
  const actionKind: ComposerActionKind = showStop
    ? 'stop'
    : !running || direct
      ? 'send'
      : mode === 'followup'
        ? 'queue'
        : mode === 'interrupt'
          ? 'interrupt'
          : 'steer';
  const observedTurn = Boolean(
    state?.turnId || state?.submissions.some((submission) => submission.state === 'running' && submission.turnId),
  );
  const stopDisabled =
    !canWrite || !controller || Boolean(session?.parent_id) || deleting || !observedTurn || cancelAction.busy;
  const profileLocked = running || pending || Boolean(uncertain);
  const profileDisabled = !mutableSettings || settingsSaving || profileLocked || !profileList.length;
  const blocked =
    !canWrite ||
    Boolean(session?.parent_id) ||
    feed !== 'connected' ||
    (direct && running) ||
    pending ||
    settingsSaving ||
    deleting ||
    Boolean(uncertain);
  const readOnly = !canWrite || Boolean(session?.parent_id) || deleting;
  const cyclesPermission =
    !readOnly && cycleLevels.length > 0 && (!permissionDisabled || settingsSaving);

  async function send() {
    await sendAction.run(async () => {
      if (blocked || !hasMessage || !controller) return;
      const submitted = draft.text;
      const ok = await controller.submitMessage(sessionId, submitted, options);
      if (ok) {
        draft.accepted(submitted);
        updateOptions((current) => remainingComposerOptions(current, options));
      }
    });
  }
  async function stop() {
    if (!running || stopDisabled || !controller) return;
    await cancelAction.run(() => controller.cancel(sessionId));
  }
  useShortcut('stopTurn', () => void stop(), running && !stopDisabled);

  function changePermission(permission: string) {
    if (permissionDisabled || !permissions.includes(permission)) return;
    void settingsAction.run(async () => controller?.patchSettings(sessionId, { permission }));
  }
  function changeProfile(profile: string) {
    if (
      profileDisabled ||
      profile === session?.profile ||
      !profileList.some((option) => option.name === profile)
    )
      return;
    void settingsAction.run(async () => controller?.patchSettings(sessionId, { profile }));
  }
  function cyclePermission() {
    const current = session?.permission ?? '';
    const next = cycleLevels[(cycleLevels.indexOf(current) + 1) % cycleLevels.length];
    if (next && next !== current) changePermission(next);
  }

  return (
    <>
      <ConflictNotice draft={draft} />
      {docked && state && (
        <QueuedDock
          sessionId={sessionId}
          submissions={state.submissions}
          canWithdraw={canWrite && !session?.parent_id && !deleting}
          onError={toastError}
        />
      )}
      <InputBar
        suggestions={composerSuggestions({ skills: skillList, profiles: profileList, permissions,
          onSkill: !readOnly && !pending && !running ? (name) => updateOptions({ skill: name }) : undefined,
          onProfile: profileDisabled ? undefined : changeProfile,
          onPermission: permissionDisabled ? undefined : changePermission,
        })}
        pending={pending}
        text={draft.text}
        onTextChange={draft.setText}
        readOnly={readOnly}
        placeholder={
          readOnly
            ? 'Read-only session'
            : feed !== 'connected'
              ? 'Waiting for session connection…'
              : 'Message meka… (/ for commands, @ for sessions)'
        }
        focusId={sessionId}
        autoFocus={autoFocus}
        images={images}
        imagesDisabled={!canWrite || Boolean(session?.parent_id) || pending || deleting}
        onImagesChange={(update) =>
          updateOptions((current) => ({ images: update(current.images) }))
        }
        skill={skill}
        onClearSkill={() => updateOptions({ skill: '' })}
        showAttachments={Boolean(info?.vision)}
        cyclePermission={{
          enabled: cyclesPermission,
          disabled: permissionDisabled,
          cycle: cyclePermission,
        }}
        permissionLabel={session?.permission ?? undefined}
        profileLabel={session?.profile ?? undefined}
        action={{
          kind: actionKind,
          label: ACTION_LABELS[actionKind],
          disabled: showStop ? stopDisabled : blocked || !hasMessage,
          busy: showStop ? cancelAction.busy : sendAction.busy,
          run: () => void (showStop ? stop() : send()),
        }}
        leading={
          canRead && skillList.length > 0 ? (
            <SkillsMenu
              skills={skillList}
              value={skill}
              disabled={!canWrite || deleting}
              onPick={(name) => updateOptions({ skill: name })}
            />
          ) : null
        }
        pills={
          <>
            <PermissionPill
              value={session?.permission ?? undefined}
              enabled={permissions}
              disabled={permissionDisabled}
              busy={mutableSettings && settingsSaving}
              onChange={changePermission}
            />
            <ProfilePill
              value={session?.profile ?? undefined}
              profiles={profileList}
              disabled={profileDisabled}
              busy={mutableSettings && !profileLocked && settingsSaving}
              locked={profileLocked}
              onChange={changeProfile}
            />
          </>
        }
        settings={
          <SettingsPopover
            mode={mode}
            retention={retention}
            source={source}
            direct={direct}
            disabled={!session || settingsSaving || deleting}
            fieldsDisabled={!canWrite || Boolean(session?.parent_id)}
            busy={Boolean(session) && !deleting && settingsSaving}
            onChange={(patch) => updateOptions(patch)}
            approvals={session?.approvals}
            onApprovalsChange={
              mutableSettings
                ? (approvals) =>
                    void settingsAction.run(async () =>
                      controller?.patchSettings(sessionId, { approvals }),
                    )
                : undefined
            }
            cwd={session?.cwd ?? ''}
            onCwdChange={
              mutableSettings
                ? (cwd) =>
                    void settingsAction.run(async () =>
                      controller?.patchSettings(sessionId, { cwd }),
                    )
                : undefined
            }
            cwdLocked={running || Boolean(session?.turn_in_flight)}
          />
        }
        onError={toastError}
      />
      {docked && (
        <div className={css.meterDock}>
          <ContextMeter sessionId={sessionId} />
        </div>
      )}
    </>
  );
}

/** The new-conversation hero composer: the same capsule writing the creation settings. */
function HeroComposer({ autoFocus }: { autoFocus: boolean }) {
  const { controller, connection, info } = useConnection();
  const runtime = useRuntime();
  const { newConversation: creation } = useSessionNavigation();
  const canWrite = useCan('sessions:w');
  const canRead = useCan('sessions:r');
  const draft = useTextDraft(runtime.storage, connection?.id ?? '', 'new');
  const options =
    useSyncExternalStore(controller?.subscribe ?? subscribeToNothing, () =>
      controller?.draft('new'),
    ) ?? emptyComposerOptions;
  function updateOptions(patch: Partial<ComposerOptions>) {
    controller?.saveDraft('new', {
      ...(controller.draft('new') ?? emptyComposerOptions),
      ...patch,
    });
  }
  const profiles = useResource<Schema['ProfilesResponse']>('/v1/profiles');
  const skills = useResource<Schema['SkillView'][]>('/v1/skills', undefined, canRead);
  const profileList = profiles.data?.profiles ?? [];
  const skillList = skills.data ?? [];
  const disabled = !canWrite || creation.busy;
  const direct = options.images.length > 0 || Boolean(options.skill) || options.retention !== 'keep';
  const permissions = info?.enabled_permissions ?? [];
  const cycleLevels = PERMISSION_LEVELS.map((level) => level.value).filter((level) =>
    permissions.includes(level),
  );
  const permission = creation.settings.permission || info?.default_permission || undefined;
  const profile =
    creation.settings.profile || profileList.find((option) => option.active)?.name || undefined;
  const cyclesPermission = !disabled && cycleLevels.length > 0;

  async function send() {
    const message = draft.text;
    const id = await creation.start(message, options);
    if (id) draft.accepted(message);
  }
  function changePermission(value: string) {
    if (disabled || !permissions.includes(value)) return;
    creation.setSettings({ ...creation.settings, permission: value });
  }
  function cyclePermission() {
    const current = permission ?? '';
    const next = cycleLevels[(cycleLevels.indexOf(current) + 1) % cycleLevels.length];
    if (next && next !== current) changePermission(next);
  }

  return (
    <>
      <ConflictNotice draft={draft} />
      <InputBar
        suggestions={composerSuggestions({ skills: skillList, profiles: profileList, permissions,
          onSkill: disabled ? undefined : (name) => updateOptions({ skill: name }),
          onProfile: disabled ? undefined : (profile) => creation.setSettings({ ...creation.settings, profile }),
          onPermission: disabled ? undefined : changePermission,
        })}
        text={draft.text}
        onTextChange={draft.setText}
        readOnly={!canWrite}
        pending={creation.busy}
        placeholder={creation.busy ? 'Creating session…' : 'Ask meka anything… (/ for commands, @ for sessions)'}
        focusId="new"
        autoFocus={autoFocus}
        images={options.images}
        imagesDisabled={disabled}
        onImagesChange={(update) =>
          updateOptions({ images: update(controller?.draft('new')?.images ?? []) })
        }
        skill={options.skill}
        onClearSkill={() => updateOptions({ skill: '' })}
        showAttachments={Boolean(info?.vision)}
        cyclePermission={{
          enabled: cyclesPermission,
          disabled,
          cycle: cyclePermission,
        }}
        permissionLabel={permission}
        profileLabel={profile}
        action={{
          kind: 'send',
          label: 'Send message',
          disabled:
            disabled ||
            creation.uncertain ||
            (!draft.text.trim() && !options.images.length && !options.skill),
          busy: creation.busy,
          spinner: creation.busy,
          run: () => void send(),
        }}
        leading={
          canRead && skillList.length > 0 ? (
            <SkillsMenu
              skills={skillList}
              value={options.skill}
              disabled={disabled}
              onPick={(name) => updateOptions({ skill: name })}
            />
          ) : null
        }
        pills={
          <>
            <PermissionPill
              value={permission}
              enabled={permissions}
              disabled={disabled}
              busy={false}
              onChange={changePermission}
            />
            <ProfilePill
              value={profile}
              profiles={profileList}
              disabled={disabled || !profileList.length}
              busy={false}
              locked={false}
              onChange={(value) => {
                if (!disabled) creation.setSettings({ ...creation.settings, profile: value });
              }}
            />
          </>
        }
        settings={
          <SettingsPopover
            mode={options.mode}
            retention={options.retention}
            source={options.source}
            direct={direct}
            disabled={disabled}
            fieldsDisabled={!canWrite}
            busy={false}
            onChange={(patch) => updateOptions(patch)}
            approvals={creation.settings.approvals === 'true'}
            onApprovalsChange={
              disabled
                ? undefined
                : (approvals) =>
                    creation.setSettings({ ...creation.settings, approvals: String(approvals) })
            }
          />
        }
        onError={toastError}
      />
    </>
  );
}

/**
 * The dsh capsule composer, docked under an existing session or as the
 * new-conversation hero. The root carries data-composer so navigation can
 * find the textarea to focus.
 */
export function Composer({
  sessionId,
  variant = 'docked',
  autoFocus,
}: {
  sessionId?: string | undefined;
  variant?: 'docked' | 'hero';
  autoFocus?: boolean;
}) {
  const hero = variant === 'hero';
  return (
    <div className={cn(css.root, hero && css.hero)} data-composer={sessionId ?? 'new'}>
      {sessionId === undefined ? (
        <HeroComposer autoFocus={autoFocus ?? hero} />
      ) : (
        <SessionComposer sessionId={sessionId} docked={!hero} autoFocus={autoFocus ?? false} />
      )}
    </div>
  );
}
