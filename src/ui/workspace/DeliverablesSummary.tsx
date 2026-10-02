import { useMemo } from 'react';
import type { SessionState } from '../../session/controller';
import { IconChevronRightOutlineRegular, IconDeliverDocRegular } from '../icons';
import { extractRecordedFiles } from './recorded-files';
import css from './Deliverables.module.css';

export function DeliverablesSummary({ state, onOpen }: { state: SessionState; onOpen: () => void }) {
  const files = useMemo(() => extractRecordedFiles(state), [state]);
  if (!files.length) return null;
  const changes = files.filter((file) => file.operations.some((operation) => operation.kind !== 'read')).length;
  return (
    <button type="button" className={css.summary} onClick={onOpen} aria-label={`Review ${files.length} recorded ${files.length === 1 ? 'file' : 'files'}`}>
      <span className={css.tile}><IconDeliverDocRegular size={24} /></span>
      <span className={css.titles}>
        <span className={css.summaryTitle}>{files.length} recorded {files.length === 1 ? 'file' : 'files'}</span>
        <span className={css.summaryHint}>{changes ? `${changes} with successful writes or edits` : 'Read results from this conversation'}</span>
      </span>
      <IconChevronRightOutlineRegular size={16} />
    </button>
  );
}
