import { create } from "zustand";
import { listSnippets, saveSnippets, type Snippet } from "../lib/ipc";

interface SnippetsState {
  snippets: Snippet[];
  load: () => Promise<void>;
  add: (text: string, title?: string) => void;
  remove: (id: string) => void;
}

function titleFor(text: string): string {
  const firstLine = text.trim().split("\n")[0];
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
}

export const useSnippetsStore = create<SnippetsState>((set, get) => ({
  snippets: [],
  load: async () => {
    try {
      set({ snippets: await listSnippets() });
    } catch {
      set({ snippets: [] });
    }
  },
  add: (text, title) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const snippets = [
      ...get().snippets,
      { id: crypto.randomUUID(), title: title?.trim() || titleFor(trimmed), text: trimmed },
    ];
    set({ snippets });
    void saveSnippets(snippets);
  },
  remove: (id) => {
    const snippets = get().snippets.filter((s) => s.id !== id);
    set({ snippets });
    void saveSnippets(snippets);
  },
}));
