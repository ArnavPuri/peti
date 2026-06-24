import type { PaneDef } from "./ipc";

// Turn a pane's `command` string into an argv pair. Claude panes default to
// `claude`; shell panes to `bash`. A command like "claude --continue" splits
// into command + args. (~ in the cwd is expanded backend-side at spawn.)
export function resolveCommand(pane: PaneDef): { command: string; args: string[] } {
  const raw = pane.command?.trim() || (pane.type === "shell" ? "bash" : "claude");
  const parts = raw.split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}
