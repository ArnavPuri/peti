import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Workspace } from "../lib/ipc";
import { accentGradient, presetCss } from "../lib/backgrounds";

// Full-bleed identity layer. background spec: null -> accent gradient,
// "preset:<id>" -> bundled gradient, else an image path.
export default function Background({ workspace }: { workspace: Workspace }) {
  const accent = workspace.accent ?? "#5cd6ae";
  const bg = workspace.background;

  const style = useMemo<React.CSSProperties>(() => {
    if (bg && bg.startsWith("preset:")) {
      return { background: presetCss(bg.slice(7)) ?? accentGradient(accent) };
    }
    if (bg) {
      return { backgroundImage: `url(${convertFileSrc(bg)})` };
    }
    return { background: accentGradient(accent) };
  }, [bg, accent]);

  return <div className="bg" style={style} />;
}
