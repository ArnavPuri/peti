import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { listDir, readFile, type FileContents, type FsEntry } from "../lib/ipc";

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  rs: "rust",
  py: "python",
  rb: "ruby",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  json: "json",
  toml: "ini",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "xml",
  xml: "xml",
  css: "css",
  scss: "scss",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  dockerfile: "dockerfile",
};

function langFor(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext];
}

// One lazy tree node (file or dir). Dirs load their children on first expand.
function TreeNode({
  entry,
  depth,
  activePath,
  onOpen,
}: {
  entry: FsEntry;
  depth: number;
  activePath: string | null;
  onOpen: (e: FsEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);

  const click = async () => {
    if (entry.is_dir) {
      if (!open && children === null) {
        try {
          setChildren(await listDir(entry.path));
        } catch {
          setChildren([]);
        }
      }
      setOpen((o) => !o);
    } else {
      onOpen(entry);
    }
  };

  return (
    <div>
      <div
        className={"cv-row" + (activePath === entry.path ? " active" : "")}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={click}
        title={entry.name}
      >
        <span className="cv-caret">{entry.is_dir ? (open ? "▾" : "▸") : ""}</span>
        <span className="cv-name">{entry.name}</span>
      </div>
      {open &&
        children?.map((c) => (
          <TreeNode key={c.path} entry={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
        ))}
    </div>
  );
}

// Read-only file browser + syntax-highlighted viewer for a directory.
export default function CodeViewer({ cwd }: { cwd: string }) {
  const [roots, setRoots] = useState<FsEntry[]>([]);
  const [active, setActive] = useState<FsEntry | null>(null);
  const [file, setFile] = useState<FileContents | null>(null);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    listDir(cwd).then(setRoots).catch(() => setRoots([]));
  }, [cwd]);

  const open = async (entry: FsEntry) => {
    setActive(entry);
    setFile(null);
    try {
      setFile(await readFile(entry.path));
    } catch (e) {
      setFile({ content: String(e), truncated: false, binary: false });
    }
  };

  useEffect(() => {
    const el = codeRef.current;
    if (!el || !file || file.binary) return;
    const lang = active ? langFor(active.name) : undefined;
    const res =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(file.content, { language: lang, ignoreIllegals: true })
        : hljs.highlightAuto(file.content);
    el.innerHTML = res.value;
  }, [file, active]);

  return (
    <div className="cv">
      <div className="cv-tree">
        {roots.map((e) => (
          <TreeNode key={e.path} entry={e} depth={0} activePath={active?.path ?? null} onOpen={open} />
        ))}
      </div>
      <div className="cv-view">
        {!active && <div className="cv-empty">Select a file to view</div>}
        {active && file?.binary && <div className="cv-empty">Binary file — not shown</div>}
        {active && file && !file.binary && (
          <pre className="cv-pre">
            <code ref={codeRef} className="hljs" />
          </pre>
        )}
        {file?.truncated && <div className="cv-trunc">… file truncated at 512 KB</div>}
      </div>
    </div>
  );
}
