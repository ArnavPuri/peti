import { create } from "zustand";

export type SendMode = "insert" | "send";

interface UiState {
  // Which terminal card the prompt bar / task clicks target.
  focusedSessionId: string | null;
  setFocused: (id: string | null) => void;

  // Insert = paste only (you press Enter); Send = paste + submit.
  sendMode: SendMode;
  setSendMode: (m: SendMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  focusedSessionId: null,
  setFocused: (focusedSessionId) => set({ focusedSessionId }),
  sendMode: "insert",
  setSendMode: (sendMode) => set({ sendMode }),
}));
