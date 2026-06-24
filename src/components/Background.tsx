import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Workspace } from "../lib/ipc";

// Full-bleed identity layer: the workspace's background image if it has one,
// otherwise an accent-tinted gradient so every Peti still reads as distinct.
export default function Background({ workspace }: { workspace: Workspace }) {
  const accent = workspace.accent ?? "#5cd6ae";

  const style = useMemo<React.CSSProperties>(() => {
    if (workspace.background) {
      return { backgroundImage: `url(${convertFileSrc(workspace.background)})` };
    }
    return {
      background: `radial-gradient(130% 130% at 25% 15%, ${accent}26, #0a0d12 58%)`,
    };
  }, [workspace.background, accent]);

  return <div className="bg" style={style} />;
}
