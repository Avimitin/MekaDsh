// Memory and skills share this page, as in mekaweb: a filterable card grid with
// create/edit/delete in modals, gated on the {kind}:r and {kind}:w scopes.

import { useState } from 'react';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { segment, type Schema } from '../../api/client';
import { cn } from '../../lib/cn';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Modal } from '../primitives/Modal';
import { Tag } from '../primitives/Tag';
import { IconPlusOutlineRegular, IconSearchOutlineRegular } from '../icons';
import { EmptyState, ErrorNotice, Loading, Page, PageHeader } from './shared/page';
import { ResourceEditor } from './resources/ResourceEditor';
import css from './ResourcesPage.module.css';

type Kind = 'memory' | 'skills';
type Detail = Schema['MemoryDetail'] | Schema['SkillDetail'];

export function ResourcesPage({ kind }: { kind: Kind }) {
  const { api, connection } = useConnection();
  const runtime = useRuntime();
  const canWrite = useCan(kind + ':w');
  const canRead = useCan(kind + ':r');
  const memories = useResource<Schema['MemoryListResponse']>(
    '/v1/memory',
    undefined,
    kind === 'memory' && canRead,
  );
  const skills = useResource<Schema['SkillView'][]>('/v1/skills', undefined, kind === 'skills');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const detail = useResource<Detail>(
    `/v1/${kind}/${segment(selected ?? '_')}`,
    undefined,
    Boolean(selected) && canRead,
  );
  const list = kind === 'memory' ? memories.data?.memories : skills.data;
  const rows = list?.filter((item) =>
    [item.name, item.description, ...('tags' in item ? item.tags : [])]
      .join(' ')
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const title = kind === 'memory' ? 'Memory' : 'Skills';
  const singular = kind === 'memory' ? 'memory' : 'skill';
  return (
    <Page>
      <PageHeader
        title={title}
        description={
          kind === 'memory'
            ? 'Notes meka recalls across sessions.'
            : 'Skills available to the agent.'
        }
        actions={
          canWrite ? (
            <Button
              variant="primary"
              icon={<IconPlusOutlineRegular size={16} />}
              onClick={() => setCreating(true)}
            >
              New {singular}
            </Button>
          ) : undefined
        }
      />
      <div className={css.toolbar}>
        <Input
          className={cn(css.search)}
          icon={<IconSearchOutlineRegular size={16} />}
          aria-label={`Search ${title.toLowerCase()}`}
          value={filter}
          placeholder={`Search ${title.toLowerCase()}…`}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ErrorNotice error={kind === 'memory' ? memories.error : skills.error} standalone />
      {!list && (memories.isFetching || skills.isFetching) && <Loading />}
      <div className={css.grid}>
        {rows?.map((item) => (
          <button
            type="button"
            className={css.card}
            key={item.name}
            disabled={!canRead}
            title={canRead ? undefined : `Reading requires ${kind}:r`}
            onClick={() => {
              runtime.queries.removeQueries({
                queryKey: [
                  connection?.id,
                  connection?.authority,
                  `/v1/${kind}/${segment(item.name)}`,
                ],
              });
              setSelected(item.name);
            }}
          >
            <div className={css.cardHead}>
              <h2 className={css.cardName}>{item.name}</h2>
              <Tag tone="neutral">Priority {item.priority}</Tag>
            </div>
            <p className={css.cardDescription}>{item.description}</p>
            <div className={css.cardMeta}>
              {'tags' in item &&
                item.tags.map((tag) => (
                  <Tag tone="outline" key={tag}>
                    {tag}
                  </Tag>
                ))}
              {'author' in item && item.author && (
                <span className={css.metaText}>{item.author}</span>
              )}
              {'version' in item && item.version && (
                <span className={css.metaText}>v{item.version}</span>
              )}
              {'updated_at' in item && (
                <span className={css.metaText}>
                  Updated {new Date(item.updated_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {rows?.length === 0 && (
        <EmptyState
          title={filter ? 'No matching entries' : `No ${title.toLowerCase()} yet`}
          hint={
            !filter && !canWrite
              ? `Creating ${title.toLowerCase()} requires ${kind}:w.`
              : undefined
          }
        />
      )}
      {!canRead && (
        <EmptyState
          title={
            kind === 'skills'
              ? 'Reading skill bodies requires skills:r.'
              : 'Reading memories requires memory:r.'
          }
        />
      )}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(undefined)}
        title={selected ?? title}
        closeLabel="Close dialog"
        className={cn(css.wideModal)}
        contentClassName={cn(css.modalScroll)}
      >
        {detail.isPending && <Loading />}
        <ErrorNotice error={detail.error} standalone />
        {detail.data && (
          <ResourceEditor
            key={kind + selected}
            kind={kind}
            initial={detail.data}
            canWrite={canWrite}
            onSaved={async () => {
              await runtime.queries.invalidateQueries();
              setSelected(undefined);
            }}
            onDelete={
              selected && canWrite
                ? async () => {
                    await api?.mutate('DELETE', `/v1/${kind}/${segment(selected)}`);
                    await runtime.queries.invalidateQueries();
                    setSelected(undefined);
                  }
                : undefined
            }
          />
        )}
      </Modal>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={`New ${singular}`}
        closeLabel="Close dialog"
        className={cn(css.wideModal)}
        contentClassName={cn(css.modalScroll)}
      >
        {creating && (
          <ResourceEditor
            kind={kind}
            canWrite={canWrite}
            onSaved={async () => {
              await runtime.queries.invalidateQueries();
              setCreating(false);
            }}
          />
        )}
      </Modal>
    </Page>
  );
}
