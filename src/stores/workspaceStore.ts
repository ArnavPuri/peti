import { create } from "zustand";
import { getWorkspace, saveBackground, type Workspace } from "../lib/ipc";

// One window hosts exactly one Peti, so this store holds a single workspace —
// there is no list and no switching.
interface WorkspaceState {
  workspace: Workspace | null;
  error: string | null;
  load: (id: string) => Promise<void>;
  // spec: "" (accent) | "preset:<id>" | image path — applied live + persisted.
  setBackground: (spec: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
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
  setBackground: (spec) => {
    const ws = get().workspace;
    if (!ws) return;
    set({ workspace: { ...ws, background: spec === "" ? null : spec } });
    void saveBackground(ws.id, spec);
  },
}));
