export type Theme = "system" | "dark" | "light";

function resolve(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

// Toggle the `theme-light` class on <html> (dark is the default in :root).
export function applyTheme(theme: Theme): void {
  const light = resolve(theme) === "light";
  document.documentElement.classList.toggle("theme-light", light);
}

// Re-apply when the OS theme changes (only matters for "system").
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => {
    if (getTheme() === "system") applyTheme("system");
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
