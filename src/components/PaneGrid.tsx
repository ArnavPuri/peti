import { Fragment, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Terminal from "./Terminal";
import { saveLayout, type Workspace } from "../lib/ipc";
import { resolveCommand } from "../lib/command";

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export default function PaneGrid({ workspace }: { workspace: Workspace }) {
  // react-resizable-panels reports sizes as percentages (summing to 100);
  // we persist fractions. Debounced so a drag doesn't spam the disk.
  const onLayout = useMemo(
    () =>
      debounce((sizes: number[]) => {
        void saveLayout(
          workspace.id,
          sizes.map((s) => s / 100),
        );
      }, 400),
    [workspace.id],
  );

  const n = workspace.panes.length;

  return (
    <PanelGroup direction="horizontal" onLayout={onLayout}>
      {workspace.panes.map((pane, i) => {
        const sessionId = `${workspace.id}::${i}`;
        const { command, args } = resolveCommand(pane);
        const size = (workspace.sizes[i] ?? 1 / n) * 100;
        return (
          <Fragment key={sessionId}>
            {i > 0 && <PanelResizeHandle className="resize-handle" />}
            <Panel defaultSize={size} minSize={10}>
              <Terminal
                sessionId={sessionId}
                cwd={pane.path}
                command={command}
                args={args}
                label={pane.label}
              />
            </Panel>
          </Fragment>
        );
      })}
    </PanelGroup>
  );
}
