import { create } from "zustand";
import {
  listWorkspaces,
  getWorkspace,
  type Workspace,
  type WorkspaceSummary,
} from "../lib/ipc";

interface WorkspacesState {
  summaries: WorkspaceSummary[];
  activeId: string | null;
  activeWorkspace: Workspace | null;
  loading: boolean;
  error: string | null;
  loadList: () => Promise<void>;
  open: (id: string) => Promise<void>;
}

export const useWorkspacesStore = create<WorkspacesState>((set) => ({
  summaries: [],
  activeId: null,
  activeWorkspace: null,
  loading: false,
  error: null,

  loadList: async () => {
    try {
      const summaries = await listWorkspaces();
      set({ summaries, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // Switching active workspace re-renders PaneGrid; the outgoing Terminals
  // unmount and kill their own PTYs (teardown), the incoming ones spawn.
  open: async (id) => {
    set({ loading: true, error: null });
    try {
      const ws = await getWorkspace(id);
      set({ activeId: id, activeWorkspace: ws, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
