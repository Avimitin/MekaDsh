// Port of mekaweb's ResourceEditor: name/priority/description/tags-or-author
// fields plus a body editor with a markdown preview. Writes keep meka's
// omitted-vs-empty semantics: an unchanged field is omitted so the server keeps
// the stored value, while an emptied body is sent as '' to clear it.

import { useState, type FormEvent } from 'react';
import { useConnection } from '../../../connections/context';
import { segment, type Schema } from '../../../api/client';
import { useAction } from '../../../lib/actions';
import { Button } from '../../primitives/Button';
import { Input } from '../../primitives/Input';
import { JsonTree } from '../../primitives/JsonTree';
import { SegmentedTabs } from '../../primitives/SegmentedTabs';
import { AssistantMarkdown } from '../../chat/AssistantMarkdown';
import { ErrorNotice, Field, Textarea, jsonTreeLabels } from '../shared/page';
import { RiskConfirmButton } from '../shared/RiskConfirmButton';
import css from './ResourceEditor.module.css';

type Kind = 'memory' | 'skills';
type Detail = Schema['MemoryDetail'] | Schema['SkillDetail'];

export function ResourceEditor({
  kind,
  initial,
  canWrite,
  onSaved,
  onDelete,
}: {
  kind: Kind;
  initial?: Detail | undefined;
  canWrite: boolean;
  onSaved: () => void | Promise<void>;
  onDelete?: (() => Promise<void>) | undefined;
}) {
  const { api } = useConnection();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [priority, setPriority] = useState(initial ? String(initial.priority) : '');
  const [tags, setTags] = useState(initial && 'tags' in initial ? initial.tags.join(', ') : '');
  const [author, setAuthor] = useState(
    initial && 'author' in initial ? (initial.author ?? '') : '',
  );
  const [tab, setTab] = useState<'source' | 'preview'>('source');
  const action = useAction();
  const singular = kind === 'memory' ? 'memory' : 'skill';

  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (!api) return;
      const changedBody = !initial || body !== (initial.body ?? '');
      const changedPriority =
        priority !== '' && (!initial || Number(priority) !== initial.priority);
      const base = {
        description,
        ...(changedBody ? { body } : {}),
        ...(changedPriority ? { priority: Number(priority) } : {}),
      };
      if (kind === 'memory') {
        const values = tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        if (values.length > 10 || values.some((tag) => !/^[a-z0-9-]+$/.test(tag)))
          throw new Error('Use at most 10 lowercase tags containing letters, numbers, or hyphens.');
        const original = initial && 'tags' in initial ? initial.tags : [];
        await api.mutate('PUT', `/v1/memory/${segment(name)}`, {
          ...base,
          ...(JSON.stringify(values) !== JSON.stringify(original) ? { tags: values } : {}),
        } satisfies Schema['WriteMemoryRequest']);
      } else {
        await api.mutate('PUT', `/v1/skills/${segment(name)}`, {
          ...base,
          ...(!initial && author ? { author } : {}),
        } satisfies Schema['WriteSkillRequest']);
      }
      await onSaved();
    });
  }

  return (
    <form className={css.form} onSubmit={(event) => void submit(event)}>
      <div className={css.grid}>
        <Field label="Name">
          <Input
            required
            value={name}
            disabled={Boolean(initial) || !canWrite || action.busy}
            onChange={(event) => setName(event.target.value)}
            pattern="[a-zA-Z0-9_-]+"
            placeholder="project-conventions"
          />
        </Field>
        <Field label="Priority" hint="0 is highest; 9 is lowest">
          <Input
            type="number"
            min="0"
            max="9"
            placeholder={initial ? 'Unchanged' : 'Server default'}
            disabled={!canWrite || action.busy}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
        </Field>
      </div>
      <Field label="Description">
        <Input
          required
          value={description}
          disabled={!canWrite || action.busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {kind === 'memory' ? (
        <Field label="Tags" hint="Comma separated, lowercase: project, preferences">
          <Input
            value={tags}
            placeholder="project, preferences"
            disabled={!canWrite || action.busy}
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>
      ) : (
        <Field label="Author" hint={initial ? 'Set at creation' : undefined}>
          <Input
            value={author}
            disabled={Boolean(initial) || !canWrite || action.busy}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </Field>
      )}
      <SegmentedTabs
        items={[
          { value: 'source', label: 'Source', id: 'resource-body-source', panelId: 'resource-body-source-panel' },
          { value: 'preview', label: 'Preview', id: 'resource-body-preview', panelId: 'resource-body-preview-panel' },
        ]}
        value={tab}
        onChange={setTab}
        label="Body view"
        className={css.tabs}
      />
      {tab === 'preview' ? (
        <div
          className={css.preview}
          id="resource-body-preview-panel"
          role="tabpanel"
          aria-labelledby="resource-body-preview"
        >
          <AssistantMarkdown text={body} />
        </div>
      ) : (
        <div id="resource-body-source-panel" role="tabpanel" aria-labelledby="resource-body-source">
          <Field label="Body">
            <Textarea
              className={css.body}
              readOnly={!canWrite}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
        </div>
      )}
      <ErrorNotice error={action.error} standalone />
      {initial && (
        <details className={css.metadata}>
          <summary className={css.metadataSummary}>Server metadata</summary>
          <div className={css.metadataBody}>
            <JsonTree
              data={Object.fromEntries(Object.entries(initial).filter(([key]) => key !== 'body'))}
              label="Server metadata"
              labels={jsonTreeLabels}
            />
          </div>
        </details>
      )}
      <div className={css.actions}>
        {onDelete && (
          <span className={css.delete}>
            <RiskConfirmButton
              title={`Delete ${singular}`}
              description="This removes the server resource. Other sessions may depend on it."
              acknowledgeLabel={`I understand this ${singular} will be permanently deleted.`}
              confirmLabel="Delete"
              busyLabel="Deleting…"
              triggerVariant="outline"
              trigger="Delete"
              onConfirm={onDelete}
            />
          </span>
        )}
        {!canWrite && <span className={css.readOnly}>Read only. Editing requires {kind}:w.</span>}
        {canWrite && (
          <Button variant="primary" type="submit" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </form>
  );
}
