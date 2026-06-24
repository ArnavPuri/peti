import { create } from "zustand";
import { listTasks, saveTasks, type Task } from "../lib/ipc";

interface TasksState {
  workspaceId: string | null;
  tasks: Task[];
  load: (id: string) => Promise<void>;
  add: (text: string) => void;
  toggle: (taskId: string) => void;
  setText: (taskId: string, text: string) => void;
  remove: (taskId: string) => void;
  move: (taskId: string, dir: -1 | 1) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Re-number `order` to match array position and persist (debounced).
function persist(workspaceId: string | null, tasks: Task[]) {
  if (!workspaceId) return;
  const ordered = tasks.map((t, i) => ({ ...t, order: i }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveTasks(workspaceId, ordered), 350);
}

export const useTasksStore = create<TasksState>((set) => ({
  workspaceId: null,
  tasks: [],

  load: async (id) => {
    const tasks = await listTasks(id);
    set({ workspaceId: id, tasks });
  },

  add: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => {
      const tasks = [
        ...s.tasks,
        { id: crypto.randomUUID(), text: trimmed, done: false, order: s.tasks.length },
      ];
      persist(s.workspaceId, tasks);
      return { tasks };
    });
  },

  toggle: (taskId) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      persist(s.workspaceId, tasks);
      return { tasks };
    }),

  setText: (taskId, text) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, text } : t));
      persist(s.workspaceId, tasks);
      return { tasks };
    }),

  remove: (taskId) =>
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== taskId);
      persist(s.workspaceId, tasks);
      return { tasks };
    }),

  move: (taskId, dir) =>
    set((s) => {
      const i = s.tasks.findIndex((t) => t.id === taskId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.tasks.length) return s;
      const tasks = [...s.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      persist(s.workspaceId, tasks);
      return { tasks };
    }),
}));

export type { Task };
