import { create } from "zustand";
import { getSettings, type AppSettings } from "../lib/ipc";

const DEFAULTS: AppSettings = {
  send_mode: "insert",
  default_model: "",
  permission_mode: "",
  alerts: true,
  theme: "dark",
};

interface SettingsState {
  settings: AppSettings;
  load: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULTS,
  load: async () => {
    try {
      set({ settings: await getSettings() });
    } catch {
      set({ settings: DEFAULTS });
    }
  },
}));
