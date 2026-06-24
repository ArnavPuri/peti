// Bundled wallpapers — Vite inlines these into the build, so they ship with the
// app. A background spec of "wallpaper:<id>" resolves to one of these URLs.

const modules = import.meta.glob("../assets/wallpapers/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface Wallpaper {
  id: string;
  label: string;
  url: string;
}

function titleCase(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const WALLPAPERS: Wallpaper[] = Object.entries(modules)
  .map(([path, url]) => {
    const file = path.split("/").pop() ?? path;
    const id = file.replace(/\.[^.]+$/, "");
    return { id, label: titleCase(id), url: url as string };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export function wallpaperUrl(id: string): string | undefined {
  return WALLPAPERS.find((w) => w.id === id)?.url;
}
