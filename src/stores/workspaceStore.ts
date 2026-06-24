import { create } from "zustand";
import { getWorkspace, type Workspace } from "../lib/ipc";

// One window hosts exactly one Peti, so this store holds a single workspace —
// there is no list and no switching.
interface WorkspaceState {
  workspace: Workspace | null;
  error: string | null;
  load: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  error: null,
  load: async (id) => {
    try {
      const workspace = await getWorkspace(id);
      set({ workspace, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
