import type { PaneDef } from "./ipc";

// Turn a pane's `command` string into an argv pair. Claude panes default to
// `claude`; shell panes to `bash`. A command like "claude --continue" splits
// into command + args. When `resume` is set on a claude pane, append
// `--continue` (unless the command already resumes). (~ in the cwd is expanded
// backend-side at spawn.)
export function resolveCommand(pane: PaneDef): { command: string; args: string[] } {
  const raw = pane.command?.trim() || (pane.type === "shell" ? "bash" : "claude");
  const parts = raw.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  if (
    pane.type === "claude" &&
    pane.resume &&
    !args.includes("--continue") &&
    !args.includes("-c") &&
    !args.includes("--resume")
  ) {
    args.push("--continue");
  }

  return { command, args };
}
