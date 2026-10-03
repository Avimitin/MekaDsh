import { useMemo } from 'react';
import type { SessionState } from '../../session/controller';
import { IconChevronRightOutlineRegular, IconDeliverDocRegular } from '../icons';
import { conversationFiles } from './conversation-files';
import css from './Deliverables.module.css';

export function DeliverablesSummary({ state, onOpen }: { state: SessionState; onOpen: () => void }) {
  const files = useMemo(() => conversationFiles(state), [state]);
  if (!files.length) return null;
  return (
    <button type="button" className={css.summary} onClick={onOpen} aria-label={`View ${files.length} ${files.length === 1 ? 'file' : 'files'}`}>
      <span className={css.tile}><IconDeliverDocRegular size={24} /></span>
      <span className={css.titles}>
        <span className={css.summaryTitle}>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
        <span className={css.summaryHint}>Preview or download current server files</span>
      </span>
      <IconChevronRightOutlineRegular size={16} />
    </button>
  );
}
