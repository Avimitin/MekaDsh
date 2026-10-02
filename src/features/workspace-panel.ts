import { createContext, useContext } from 'react';

export type WorkspaceTab = 'files' | 'activity' | 'session';

/** Presentation state only. A file path refers to recorded tool content, never a host read. */
export const WorkspacePanelContext = createContext<{
  tab: WorkspaceTab;
  selectedPath: string | undefined;
  openPanel: (tab: WorkspaceTab, path?: string) => void;
} | null>(null);

export function useWorkspacePanel() {
  return useContext(WorkspacePanelContext);
}
