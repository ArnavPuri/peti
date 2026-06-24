import { create } from "zustand";
import type { SessionState } from "../lib/ipc";

export type SessionStatus = "spawning" | "running" | "exited";

interface SessionsState {
  // PTY lifecycle status.
  statuses: Record<string, SessionStatus>;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  remove: (sessionId: string) => void;

  // Claude activity (from the transcript): working / awaiting / idle.
  activity: Record<string, SessionState>;
  setActivity: (sessionId: string, state: SessionState) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  statuses: {},
  setStatus: (sessionId, status) =>
    set((s) => ({ statuses: { ...s.statuses, [sessionId]: status } })),
  remove: (sessionId) =>
    set((s) => {
      const next = { ...s.statuses };
      delete next[sessionId];
      const activity = { ...s.activity };
      delete activity[sessionId];
      return { statuses: next, activity };
    }),

  activity: {},
  setActivity: (sessionId, state) =>
    set((s) => ({ activity: { ...s.activity, [sessionId]: state } })),
}));
