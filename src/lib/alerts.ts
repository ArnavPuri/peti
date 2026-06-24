import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted = false;

export async function ensureNotifyPermission(): Promise<void> {
  granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
}

export function notify(title: string, body: string): void {
  if (granted) sendNotification({ title, body });
}

// A short two-note chime via Web Audio — no asset to bundle.
export function chime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { f: 660, t: 0 },
      { f: 880, t: 0.12 },
    ];
    for (const { f, t } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.15, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    }
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Web Audio unavailable — silently skip.
  }
}
