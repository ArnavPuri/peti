//! Render a `Plan` to a Claude-readable `.peti/PLAN.md` and sync it into each
//! distinct Claude-pane working directory. One-way: Peti always wins.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::tasks::{Plan, Task};
use super::workspace::{PaneDef, PaneType};

/// Render the plan as Markdown. Pure — no IO.
pub fn render_plan_md(name: &str, plan: &Plan) -> String {
    let mut out = format!("# {name}\n");
    if !plan.description.trim().is_empty() {
        out.push('\n');
        out.push_str(plan.description.trim());
        out.push('\n');
    }

    let line = |t: &Task| -> String {
        let mark = if t.done { "x" } else { " " };
        let mut s = format!("- [{mark}] (P{}) {}", t.priority, t.text);
        for label in &t.labels {
            s.push_str(&format!("  #{label}"));
        }
        s.push('\n');
        s
    };

    // Next up: pinned, unfinished — by priority then order.
    let mut next: Vec<&Task> =
        plan.tasks.iter().filter(|t| t.next_up && !t.done).collect();
    next.sort_by_key(|t| (t.priority, t.order));
    if !next.is_empty() {
        out.push_str("\n## Next up\n");
        for t in next {
            out.push_str(&line(t));
        }
    }

    // Everything else: unfinished by priority then order, done last.
    let mut rest: Vec<&Task> =
        plan.tasks.iter().filter(|t| !(t.next_up && !t.done)).collect();
    rest.sort_by_key(|t| (t.done, t.priority, t.order));
    if !rest.is_empty() {
        out.push_str("\n## Tasks\n");
        for t in rest {
            out.push_str(&line(t));
        }
    }

    out
}

/// Ensure `.peti/` is ignored in the repo at `dir`. No-op unless `dir/.git`
/// exists. Idempotent.
pub fn ensure_gitignore(dir: &Path) {
    if !dir.join(".git").exists() {
        return;
    }
    let gi = dir.join(".gitignore");
    let existing = fs::read_to_string(&gi).unwrap_or_default();
    let already = existing
        .lines()
        .any(|l| matches!(l.trim(), ".peti/" | ".peti"));
    if already {
        return;
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(".peti/\n");
    let _ = fs::write(gi, next);
}

fn write_to_dir(dir: &Path, name: &str, plan: &Plan) -> Result<(), String> {
    let peti = dir.join(".peti");
    fs::create_dir_all(&peti).map_err(|e| e.to_string())?;
    fs::write(peti.join("PLAN.md"), render_plan_md(name, plan)).map_err(|e| e.to_string())?;
    ensure_gitignore(dir);
    Ok(())
}

/// Write PLAN.md into each distinct Claude-pane directory. Best-effort: a
/// failure on one directory does not block the others.
pub fn sync(name: &str, panes: &[PaneDef], plan: &Plan) {
    let mut seen = HashSet::new();
    for pane in panes {
        if pane.pane_type != PaneType::Claude {
            continue;
        }
        let dir = super::expand_tilde(&pane.path);
        if !seen.insert(dir.clone()) {
            continue;
        }
        let _ = write_to_dir(&dir, name, plan);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(text: &str, priority: u8, done: bool, next_up: bool, labels: &[&str]) -> Task {
        Task {
            id: text.to_string(),
            text: text.to_string(),
            done,
            order: 0,
            priority,
            labels: labels.iter().map(|s| s.to_string()).collect(),
            next_up,
        }
    }

    #[test]
    fn renders_sections_and_ordering() {
        let plan = Plan {
            description: "  build the thing  ".to_string(),
            tasks: vec![
                t("pinned p1", 1, false, true, &["release"]),
                t("backlog p2", 2, false, false, &[]),
                t("backlog p1", 1, false, false, &["infra"]),
                t("already done", 2, true, false, &[]),
            ],
        };
        let md = render_plan_md("Peti", &plan);
        assert!(md.starts_with("# Peti\n"));
        assert!(md.contains("\nbuild the thing\n")); // trimmed description
        // Next up section present, with the pinned task + its label.
        let next_idx = md.find("## Next up").unwrap();
        assert!(md[next_idx..].contains("- [ ] (P1) pinned p1  #release"));
        // Tasks section: P1 backlog before P2 backlog, done last.
        let tasks_idx = md.find("## Tasks").unwrap();
        let p1 = md.find("backlog p1").unwrap();
        let p2 = md.find("backlog p2").unwrap();
        let done = md.find("already done").unwrap();
        assert!(tasks_idx < p1 && p1 < p2 && p2 < done);
        assert!(md.contains("- [x] (P2) already done"));
    }

    #[test]
    fn omits_empty_sections_and_description() {
        let plan = Plan { description: String::new(), tasks: vec![] };
        let md = render_plan_md("Empty", &plan);
        assert_eq!(md, "# Empty\n");
        assert!(!md.contains("## Next up"));
        assert!(!md.contains("## Tasks"));
    }

    #[test]
    fn gitignore_is_idempotent_and_git_gated() {
        let dir = std::env::temp_dir().join(format!("peti-plan-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // No .git → no .gitignore written.
        ensure_gitignore(&dir);
        assert!(!dir.join(".gitignore").exists());

        // With .git → entry added once, even when called twice.
        fs::create_dir_all(dir.join(".git")).unwrap();
        ensure_gitignore(&dir);
        ensure_gitignore(&dir);
        let gi = fs::read_to_string(dir.join(".gitignore")).unwrap();
        assert_eq!(gi.matches(".peti/").count(), 1);

        let _ = fs::remove_dir_all(&dir);
    }

    fn pane(path: &std::path::Path, pane_type: super::PaneType) -> super::PaneDef {
        super::PaneDef {
            label: "p".to_string(),
            path: path.to_string_lossy().into_owned(),
            pane_type,
            command: None,
            resume: false,
            rect: None,
        }
    }

    #[test]
    fn sync_writes_only_to_distinct_claude_dirs() {
        let root = std::env::temp_dir().join(format!("peti-sync-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let claude_dir = root.join("api");
        let shell_dir = root.join("scripts");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::create_dir_all(&shell_dir).unwrap();

        let plan = Plan {
            description: String::new(),
            tasks: vec![t("do it", 1, false, false, &[])],
        };
        // Two Claude panes share `claude_dir` (dedup) + one Shell pane (skipped).
        let panes = vec![
            pane(&claude_dir, super::PaneType::Claude),
            pane(&claude_dir, super::PaneType::Claude),
            pane(&shell_dir, super::PaneType::Shell),
        ];
        sync("Peti", &panes, &plan);

        let written = fs::read_to_string(claude_dir.join(".peti").join("PLAN.md")).unwrap();
        assert!(written.contains("- [ ] (P1) do it"));
        // Shell-pane dir gets no PLAN.md.
        assert!(!shell_dir.join(".peti").exists());

        let _ = fs::remove_dir_all(&root);
    }
}
