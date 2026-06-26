import { create } from "zustand";
import { getPlan, savePlan, syncPlanMd, type Task } from "../lib/ipc";

interface TasksState {
  workspaceId: string | null;
  description: string;
  tasks: Task[];
  load: (id: string) => Promise<void>;
  setDescription: (text: string) => void;
  add: (text: string) => void;
  toggle: (taskId: string) => void;
  setText: (taskId: string, text: string) => void;
  remove: (taskId: string) => void;
  move: (taskId: string, dir: -1 | 1) => void;
  setPriority: (taskId: string, priority: number) => void;
  toggleNextUp: (taskId: string) => void;
  addLabel: (taskId: string, label: string) => void;
  removeLabel: (taskId: string, label: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Re-number `order` to match array position, persist the plan, then mirror it
// to each Claude pane's PLAN.md (debounced).
function persist(workspaceId: string | null, description: string, tasks: Task[]) {
  if (!workspaceId) return;
  const ordered = tasks.map((t, i) => ({ ...t, order: i }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void savePlan(workspaceId, { description, tasks: ordered }).then(() =>
      syncPlanMd(workspaceId),
    );
  }, 350);
}

export const useTasksStore = create<TasksState>((set) => ({
  workspaceId: null,
  description: "",
  tasks: [],

  load: async (id) => {
    const plan = await getPlan(id);
    set({ workspaceId: id, description: plan.description, tasks: plan.tasks });
  },

  setDescription: (text) =>
    set((s) => {
      persist(s.workspaceId, text, s.tasks);
      return { description: text };
    }),

  add: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => {
      const tasks = [
        ...s.tasks,
        {
          id: crypto.randomUUID(),
          text: trimmed,
          done: false,
          order: s.tasks.length,
          priority: 2,
          labels: [],
          nextUp: false,
        },
      ];
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    });
  },

  toggle: (taskId) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  setText: (taskId, text) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, text } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  remove: (taskId) =>
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== taskId);
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  move: (taskId, dir) =>
    set((s) => {
      const i = s.tasks.findIndex((t) => t.id === taskId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.tasks.length) return s;
      const tasks = [...s.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  setPriority: (taskId, priority) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, priority } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  toggleNextUp: (taskId) =>
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, nextUp: !t.nextUp } : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  addLabel: (taskId, label) => {
    const tag = label.trim();
    if (!tag) return;
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId && !t.labels.includes(tag)
          ? { ...t, labels: [...t.labels, tag] }
          : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    });
  },

  removeLabel: (taskId, label) =>
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, labels: t.labels.filter((l) => l !== label) } : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),
}));

export type { Task };
