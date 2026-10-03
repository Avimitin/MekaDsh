// Port of mekaweb's settings page (minus the welcome/connection welcome flow)
// as dsh settings sections: connections, appearance, notifications,
// diagnostics, profiles, and standing instructions.

import { useState } from 'react';
import { useConnection, useResource, useRuntime, useSettings } from '../../connections/context';
import type { Connection } from '../../connections/storage';
import {
  CONVERSATION_FONT,
  CONVERSATION_OFFSET,
  CONVERSATION_WIDTH,
} from '../../connections/storage';
import { ApiError, download, type Schema } from '../../api/client';
import { supportedVersions } from '../../api/version';
import { useAction } from '../../lib/actions';
import { cn } from '../../lib/cn';
import { Button } from '../primitives/Button';
import { JsonTree } from '../primitives/JsonTree';
import { Modal } from '../primitives/Modal';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { Switch } from '../primitives/Switch';
import { Tag } from '../primitives/Tag';
import {
  IconCheckCircleFillRegular,
  IconDownloadOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconRightUpOutlineRegular,
} from '../icons';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  Page,
  PageHeader,
  Row,
  Section,
  SectionFooter,
  jsonTreeLabels,
} from './shared/page';
import { RiskConfirmButton } from './shared/RiskConfirmButton';
import { ConnectionForm } from './settings/ConnectionForm';
import { FileAccessSettings } from './settings/FileAccessSettings';
import { NotificationsSection } from './settings/NotificationsSection';
import { StepperInput } from './settings/StepperInput';
import css from './SettingsPage.module.css';

export function SettingsPage() {
  const settings = useSettings();
  const runtime = useRuntime();
  const state = useConnection();
  const [edit, setEdit] = useState<Connection | 'new'>();
  const [docsUnavailable, setDocsUnavailable] = useState(false);
  const action = useAction();
  const live = useResource<Schema['LiveResponse']>('/v1/health/live');
  const ready = useResource<Schema['ReadyResponse']>('/v1/health/ready');
  const profiles = useResource<Schema['ProfilesResponse']>('/v1/profiles');
  const instructions = useResource<Schema['InstructionsResponse']>(
    '/v1/instructions',
    undefined,
    state.info?.scopes.includes('sessions:r'),
  );
  const info = state.info;
  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Connections, appearance, notifications, and server diagnostics."
        actions={
          <Button
            variant="primary"
            icon={<IconPlusOutlineRegular size={16} />}
            onClick={() => setEdit('new')}
          >
            Add connection
          </Button>
        }
      />
      <Section title="Connections" description="Saved meka endpoints in this browser.">
        {settings.connections.map((c, index) => (
          <Row
            key={c.id}
            flush={index === 0}
            label={
              <>
                {c.name}
                {state.connection?.id === c.id && (
                  <Tag tone="success">
                    <span className={css.activeMark}>
                      <IconCheckCircleFillRegular size={12} />
                    </span>
                    {state.connectionIssue ? 'Active' : 'Connected'}
                  </Tag>
                )}
              </>
            }
            description={
              <>
                <span className={css.endpoint}>{c.endpoint}</span>
                <br />
                Token storage:{' '}
                {c.remember ? 'Local storage (persistent)' : 'Session storage (this tab)'}
              </>
            }
            control={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<IconEditOutlineRegular size={14} />}
                  title="Edit connection or replace token"
                  onClick={() => setEdit(c)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Delete this connection's saved token from this browser"
                  onClick={() => runtime.storage.forget(c.id)}
                >
                  Forget token
                </Button>
                <RiskConfirmButton
                  title="Remove connection"
                  description="Remove this endpoint, its saved token, and local drafts. Server data is unaffected."
                  acknowledgeLabel="I understand local drafts for this connection will be removed."
                  confirmLabel="Remove"
                  busyLabel="Removing…"
                  trigger="Remove"
                  onConfirm={() => {
                    runtime.storage.remove(c.id);
                    return Promise.resolve();
                  }}
                />
              </>
            }
          />
        ))}
        {settings.connections.length === 0 && <EmptyState title="No saved connections" />}
        <SectionFooter>
          <Button variant="outline" onClick={() => runtime.disconnect()}>
            Disconnect
          </Button>
        </SectionFooter>
      </Section>
      <FileAccessSettings />
      <Section title="Appearance" description="Theme and conversation reading layout.">
        <Row
          flush
          label="Color theme"
          control={
            <SegmentedControl
              kind="choices"
              id="settings-theme"
              label="Color theme"
              value={settings.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(value) => runtime.storage.theme(value)}
            />
          }
        />
        <Row
          label="Conversation font size"
          description="Base size of conversation text."
          control={
            <StepperInput
              label="Conversation font size"
              value={settings.conversationFontSize}
              step={CONVERSATION_FONT.step}
              onCommit={(size) => {
                if (typeof size === 'number') runtime.storage.conversationFontSize(size);
              }}
            />
          }
        />
        <Row
          label="Conversation max width"
          description="Leave blank for full width."
          control={
            <StepperInput
              label="Conversation max width"
              value={settings.conversationMaxWidth}
              step={CONVERSATION_WIDTH.step}
              fullWidthFallback={CONVERSATION_WIDTH.default}
              onCommit={(width) => runtime.storage.conversationMaxWidth(width)}
            />
          }
        />
        <Row
          label="Center conversation on"
          control={
            <SegmentedControl
              kind="choices"
              id="settings-anchor"
              label="Center conversation on"
              value={settings.conversationAnchor}
              options={[
                { value: 'page', label: 'Page' },
                { value: 'area', label: 'Area' },
              ]}
              onChange={(value) => runtime.storage.conversationAnchor(value)}
            />
          }
        />
        <Row
          label="Conversation offset"
          description="Pixels to move the conversation; negative moves it left."
          control={
            <StepperInput
              label="Conversation offset"
              value={settings.conversationOffset}
              step={CONVERSATION_OFFSET.step}
              min={-CONVERSATION_OFFSET.limit}
              hint="Pixels to move the conversation; negative moves it left. It stays between the panels. Press Enter to apply."
              onCommit={(offset) => {
                if (typeof offset === 'number') runtime.storage.conversationOffset(offset);
              }}
            />
          }
        />
        <SectionFooter>
          <Button
            variant="outline"
            disabled={
              settings.conversationFontSize === CONVERSATION_FONT.default &&
              settings.conversationMaxWidth === CONVERSATION_WIDTH.default &&
              settings.conversationAnchor === 'page' &&
              settings.conversationOffset === CONVERSATION_OFFSET.default
            }
            title="Reset the conversation font size, width, and position; the color theme is kept"
            onClick={() => runtime.storage.resetConversationAppearance()}
          >
            Restore defaults
          </Button>
        </SectionFooter>
      </Section>
      <NotificationsSection />
      <Section title="Diagnostics" description="Versions, health, and what this token may do.">
        <Row flush label="mekadsh version" control={<span className={css.value}>{__MEKADSH_VERSION__}</span>} />
        <Row
          label="meka version"
          description={
            info && !supportedVersions.includes(info.version) ? (
              <span className={css.versionWarning}>
                Unverified version (supported: {supportedVersions.join(', ')}).
              </span>
            ) : undefined
          }
          control={<span className={css.value}>{info?.version ?? 'Unknown'}</span>}
        />
        <Row
          label="Liveness"
          control={
            <span className={css.value}>
              {live.isPending ? 'Checking…' : (live.data?.status ?? 'Unavailable')}
            </span>
          }
        />
        <Row
          label="Readiness"
          control={
            <span className={css.value}>
              {ready.isPending ? 'Checking…' : (ready.data?.status ?? 'Unavailable')}
            </span>
          }
        />
        <Row
          label="Default permission"
          control={<span className={css.value}>{info?.default_permission ?? 'Unknown'}</span>}
        />
        <Row
          label="Enabled permissions"
          control={
            <span className={css.scopeList}>
              {info?.enabled_permissions.map((permission) => (
                <Tag tone="neutral" key={permission}>
                  {permission}
                </Tag>
              ))}
            </span>
          }
        />
        <Row
          label="Vision"
          control={
            <span className={css.value}>{info?.vision ? 'Available' : 'Unavailable'}</span>
          }
        />
        <Row
          label="Token scopes"
          control={
            <span className={css.scopeList}>
              {info?.scopes.map((scope) => (
                <Tag tone="outline" key={scope}>
                  {scope}
                </Tag>
              ))}
            </span>
          }
        />
        <ErrorNotice error={live.error ?? ready.error} />
        {ready.data && (
          <details className={css.detailsRow}>
            <summary className={css.detailsSummary}>Readiness details</summary>
            <div className={css.detailsBody}>
              <JsonTree data={ready.data} label="Readiness details" labels={jsonTreeLabels} />
            </div>
          </details>
        )}
        <SectionFooter>
          <Button
            variant="outline"
            onClick={() => {
              void live.refetch();
              void ready.refetch();
            }}
          >
            Refresh health
          </Button>
          {!docsUnavailable && (
            <Button
              variant="outline"
              icon={<IconDownloadOutlineRegular size={14} />}
              title="Requires API documentation to be enabled on the server"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  if (!state.api) return;
                  try {
                    download(await state.api.blob('/v1/openapi.json'), 'meka-openapi.json');
                  } catch (error) {
                    if (error instanceof ApiError && error.status === 404) {
                      setDocsUnavailable(true);
                      return;
                    }
                    throw error;
                  }
                })
              }
            >
              Download OpenAPI JSON
            </Button>
          )}
          {state.api && !docsUnavailable && (
            <a
              className={css.linkButton}
              href={state.api.url('/v1/docs')}
              title="Requires API documentation to be enabled on the server"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open API docs
              <IconRightUpOutlineRegular size={14} />
            </a>
          )}
        </SectionFooter>
        <ErrorNotice error={action.error} />
        <Row
          label="Show context added by meka"
          description="Reveal the context blocks meka adds to a turn."
          control={
            <Switch
              label="Show context added by meka"
              checked={settings.showTurnContext}
              onChange={(checked) => runtime.storage.showTurnContext(checked)}
            />
          }
        />
      </Section>
      <Section title="Profiles" description="Profiles configured on this meka.">
        <ErrorNotice error={profiles.error} />
        {profiles.data?.profiles.map((p, index) => (
          <Row
            key={p.name}
            flush={index === 0}
            label={
              <>
                {p.name}
                {p.active && <Tag tone="info">Default</Tag>}
              </>
            }
            description={`${p.model ?? 'No model'} · ${p.backend ?? 'Backend unavailable'} · Account: ${p.account}`}
          />
        ))}
        {profiles.data?.profiles.length === 0 && <EmptyState title="No profiles configured" />}
      </Section>
      {info?.scopes.includes('sessions:r') && (
        <Section
          title="Standing instructions"
          description="The instructions every session on this meka runs under."
        >
          <ErrorNotice error={instructions.error} />
          {instructions.isPending ? (
            <Loading />
          ) : instructions.data?.content ? (
            <>
              {instructions.data.source && (
                <p className={css.instructionsSource}>{instructions.data.source}</p>
              )}
              <pre className={css.instructions}>{instructions.data.content}</pre>
            </>
          ) : (
            !instructions.error && <EmptyState title="No standing instructions configured." />
          )}
        </Section>
      )}
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(undefined)}
        title={edit === 'new' ? 'Add connection' : 'Edit connection'}
        closeLabel="Close dialog"
        className={cn(css.modal)}
        contentClassName={cn(css.modalScroll)}
      >
        {edit && (
          <ConnectionForm
            key={edit === 'new' ? 'new' : edit.id}
            existing={edit === 'new' ? undefined : edit}
            onConnected={() => setEdit(undefined)}
          />
        )}
      </Modal>
    </Page>
  );
}
