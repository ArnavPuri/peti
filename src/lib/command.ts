import type { AppSettings, PaneDef } from "./ipc";

// Turn a pane's `command` string into an argv pair. Claude panes default to
// `claude`; shell panes to `bash`. A command like "claude --continue" splits
// into command + args. For claude panes we also fold in:
//   - `--continue` when the pane has resume = true
//   - `--model` / `--permission-mode` from app settings, unless the pane's own
//     command already sets them.
// (~ in the cwd is expanded backend-side at spawn.)
export function resolveCommand(
  pane: PaneDef,
  settings?: AppSettings | null,
): { command: string; args: string[] } {
  const raw = pane.command?.trim() || (pane.type === "shell" ? "bash" : "claude");
  const parts = raw.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  if (pane.type !== "claude") return { command, args };

  if (
    pane.resume &&
    !args.includes("--continue") &&
    !args.includes("-c") &&
    !args.includes("--resume")
  ) {
    args.push("--continue");
  }

  const model = settings?.default_model?.trim();
  if (model && !args.includes("--model")) {
    args.push("--model", model);
  }

  const perm = settings?.permission_mode?.trim();
  if (perm && !args.includes("--permission-mode")) {
    args.push("--permission-mode", perm);
  }

  return { command, args };
}
