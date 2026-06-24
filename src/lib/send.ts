import { writePane } from "./ipc";
import type { SendMode } from "../stores/uiStore";

// Wrap text in a bracketed paste (ESC[200~ … ESC[201~) so multi-line content
// doesn't trigger early submits in Claude's TUI. In "send" mode we append a
// carriage return to submit; in "insert" mode the user presses Enter themselves.
const BRACKET_START = "\x1b[200~";
const BRACKET_END = "\x1b[201~";

export async function sendToPane(
  sessionId: string,
  text: string,
  mode: SendMode,
): Promise<void> {
  const payload = BRACKET_START + text + BRACKET_END + (mode === "send" ? "\r" : "");
  await writePane(sessionId, new TextEncoder().encode(payload));
}
