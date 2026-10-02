// Port of mekaweb's MCP page: server state cards with reconnect, and a modal
// listing each connected server's advertised tools with their permissions.

import { useState } from 'react';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { segment, type Schema } from '../../api/client';
import { useAction } from '../../lib/actions';
import { cn } from '../../lib/cn';
import { Button } from '../primitives/Button';
import { Modal } from '../primitives/Modal';
import { Tag } from '../primitives/Tag';
import type { TagTone } from '../primitives/Tag';
import { IconApiOutlineRegular, IconRefreshOutlineRegular } from '../icons';
import { EmptyState, ErrorNotice, Loading, Notice, Page, PageHeader } from './shared/page';
import css from './McpPage.module.css';

const STATE_TONES: Record<string, TagTone> = {
  pending: 'warning',
  connected: 'success',
  failed: 'danger',
  disabled: 'neutral',
};

export function McpPage() {
  const servers = useResource<Schema['McpServerStateView'][]>('/v1/mcp');
  const { api } = useConnection();
  const runtime = useRuntime();
  const canRead = useCan('mcp:r');
  const canWrite = useCan('mcp:w');
  const [selected, setSelected] = useState<string>();
  const [outcome, setOutcome] = useState('');
  const action = useAction();
  const tools = useResource<Schema['McpToolsResponse']>(
    `/v1/mcp/${segment(selected ?? '_')}/tools`,
    undefined,
    Boolean(selected) && canRead,
  );
  return (
    <Page>
      <PageHeader
        title="MCP servers"
        description="External tool servers configured on this meka."
        actions={
          <Button
            variant="outline"
            icon={<IconRefreshOutlineRegular size={16} />}
            onClick={() => void servers.refetch()}
          >
            Refresh
          </Button>
        }
      />
      <ErrorNotice error={servers.error ?? action.error} standalone />
      {outcome && (
        <div role="status">
          <Notice>{outcome}</Notice>
        </div>
      )}
      {servers.isPending && <Loading />}
      <div className={css.grid}>
        {servers.data?.map((server) => (
          <article className={css.card} key={server.name}>
            <header className={css.cardHead}>
              <span className={css.cardIcon}>
                <IconApiOutlineRegular size={16} />
              </span>
              <h2 className={css.cardName}>{server.name}</h2>
              <Tag tone={STATE_TONES[server.state] ?? 'outline'}>{server.state}</Tag>
            </header>
            <div className={css.cardActions}>
              <Button
                variant="outline"
                size="sm"
                disabled={!canRead || server.state !== 'connected'}
                title={
                  !canRead
                    ? 'Requires mcp:r'
                    : server.state !== 'connected'
                      ? 'Tools are available once this server connects.'
                      : undefined
                }
                onClick={() => setSelected(server.name)}
              >
                View tools
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canWrite || action.busy || server.state === 'disabled'}
                title={
                  !canWrite
                    ? 'Requires mcp:w'
                    : server.state === 'disabled'
                      ? 'Enable this server in meka configuration first.'
                      : undefined
                }
                onClick={() =>
                  void action.run(async () => {
                    if (!api) return;
                    const result = await api.mutate<Schema['McpReconnectResponse']>(
                      'POST',
                      `/v1/mcp/${segment(server.name)}/reconnect`,
                    );
                    setOutcome(
                      `${result.server}: ${result.state}${result.state === 'failed' ? '. Check the MCP server configuration and logs.' : result.state === 'pending' ? '. A connection attempt is already in progress.' : '.'}`,
                    );
                    await runtime.queries.invalidateQueries();
                  })
                }
              >
                Reconnect
              </Button>
            </div>
          </article>
        ))}
      </div>
      {servers.data?.length === 0 && <EmptyState title="No MCP servers configured" />}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(undefined)}
        title={`${selected ?? 'Server'} tools`}
        closeLabel="Close dialog"
        className={cn(css.wideModal)}
        contentClassName={cn(css.modalScroll)}
      >
        <ErrorNotice error={tools.error} standalone />
        {tools.isPending && <Loading />}
        <div>
          {tools.data?.tools.map((tool) => (
            <article className={css.tool} key={tool.raw_name}>
              <h3 className={css.toolHead}>
                <span className={css.toolName}>{tool.raw_name}</span>
                <Tag tone="neutral">{tool.required_permission}</Tag>
                {!tool.allowed && <Tag tone="warning">Filtered out</Tag>}
              </h3>
              <p className={css.toolDescription}>{tool.description}</p>
              <details className={css.disclosure}>
                <summary className={css.disclosureSummary}>Permission details</summary>
                <p className={css.disclosureBody}>
                  Source: {tool.permission_source}.
                  {tool.read_only_hint_declined &&
                    ' The server’s read-only hint was not trusted.'}
                </p>
              </details>
            </article>
          ))}
        </div>
        {tools.data?.tools.length === 0 && <EmptyState title="No tools advertised" />}
      </Modal>
    </Page>
  );
}
