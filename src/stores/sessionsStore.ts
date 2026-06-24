import { create } from "zustand";

export type SessionStatus = "spawning" | "running" | "exited";

interface SessionsState {
  statuses: Record<string, SessionStatus>;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  remove: (sessionId: string) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  statuses: {},
  setStatus: (sessionId, status) =>
    set((s) => ({ statuses: { ...s.statuses, [sessionId]: status } })),
  remove: (sessionId) =>
    set((s) => {
      const next = { ...s.statuses };
      delete next[sessionId];
      return { statuses: next };
    }),
}));
