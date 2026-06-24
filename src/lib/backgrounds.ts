// Built-in gradient presets — no assets to bundle. A background spec is either
// "" (accent gradient), "preset:<id>", or an image path.

export interface BgPreset {
  id: string;
  label: string;
  css: string;
}

export const PRESETS: BgPreset[] = [
  {
    id: "sakura",
    label: "Sakura",
    css: "radial-gradient(130% 130% at 25% 12%, #f6b8d0 0%, #b98ac9 38%, #2a2140 78%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    css: "radial-gradient(120% 120% at 30% 18%, #3fd6c0 0%, #2a6f97 46%, #0a1020 82%)",
  },
  {
    id: "dusk",
    label: "Dusk",
    css: "radial-gradient(130% 130% at 70% 18%, #2a5d63 0%, #14323b 46%, #0a0d12 82%)",
  },
  {
    id: "dawn",
    label: "Dawn",
    css: "radial-gradient(130% 130% at 30% 14%, #2b3570 0%, #1a1f4a 46%, #0a0d18 86%)",
  },
  {
    id: "ember",
    label: "Ember",
    css: "radial-gradient(130% 130% at 25% 82%, #c8542f 0%, #5a2230 46%, #0e0a10 86%)",
  },
  {
    id: "forest",
    label: "Forest",
    css: "radial-gradient(130% 130% at 30% 18%, #2f6f4e 0%, #173a2e 46%, #0a0f0c 86%)",
  },
  {
    id: "mono",
    label: "Mono",
    css: "radial-gradient(130% 130% at 30% 18%, #2a2f37 0%, #14181d 52%, #07090c 92%)",
  },
];

export function presetCss(id: string): string | undefined {
  return PRESETS.find((p) => p.id === id)?.css;
}

export function accentGradient(accent: string): string {
  return `radial-gradient(130% 130% at 25% 15%, ${accent}26, #0a0d12 58%)`;
}
