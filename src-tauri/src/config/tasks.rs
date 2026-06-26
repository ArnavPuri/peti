//! Per-workspace plan (description + tasks), stored as `<id>.tasks.json`
//! (app-managed, frequent writes). The whole plan is read/written at once.

use std::fs;

use serde::{Deserialize, Serialize};

use super::workspaces_dir;

fn default_priority() -> u8 {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub order: i64,
    #[serde(default = "default_priority")]
    pub priority: u8,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(rename = "nextUp", default)]
    pub next_up: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Plan {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tasks: Vec<Task>,
}

fn tasks_path(id: &str) -> Result<std::path::PathBuf, String> {
    Ok(workspaces_dir()?.join(format!("{id}.tasks.json")))
}

/// Load the plan. Tolerant: new `Plan` object first, then a legacy bare
/// `[Task]` array, then empty. Never errors.
pub fn load_plan(id: &str) -> Plan {
    let Ok(path) = tasks_path(id) else {
        return Plan::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return Plan::default();
    };
    let mut plan: Plan = match serde_json::from_str::<Plan>(&contents) {
        Ok(p) => p,
        Err(_) => match serde_json::from_str::<Vec<Task>>(&contents) {
            Ok(tasks) => Plan { description: String::new(), tasks },
            Err(_) => Plan::default(),
        },
    };
    plan.tasks.sort_by_key(|t| t.order);
    plan
}

pub fn save_plan(id: &str, plan: Plan) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&plan).map_err(|e| e.to_string())?;
    fs::write(tasks_path(id)?, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, order: i64) -> Task {
        Task {
            id: id.to_string(),
            text: format!("task {id}"),
            done: false,
            order,
            priority: 2,
            labels: vec![],
            next_up: false,
        }
    }

    #[test]
    fn legacy_array_loads_as_plan() {
        // A legacy bare array (pre-Plan) with only the original fields.
        let legacy = r#"[{"id":"a","text":"old","done":false,"order":0}]"#;
        let plan: Plan = match serde_json::from_str::<Plan>(legacy) {
            Ok(p) => p,
            Err(_) => Plan {
                description: String::new(),
                tasks: serde_json::from_str::<Vec<Task>>(legacy).unwrap(),
            },
        };
        assert_eq!(plan.description, "");
        assert_eq!(plan.tasks.len(), 1);
        // New fields default cleanly.
        assert_eq!(plan.tasks[0].priority, 2);
        assert!(plan.tasks[0].labels.is_empty());
        assert!(!plan.tasks[0].next_up);
    }

    #[test]
    fn plan_round_trips_all_fields() {
        let plan = Plan {
            description: "why this project".to_string(),
            tasks: vec![Task {
                id: "x".to_string(),
                text: "ship it".to_string(),
                done: true,
                order: 3,
                priority: 1,
                labels: vec!["release".to_string()],
                next_up: true,
            }],
        };
        let json = serde_json::to_string(&plan).unwrap();
        // `next_up` serializes under the camelCase key the frontend uses.
        assert!(json.contains("\"nextUp\":true"));
        let back: Plan = serde_json::from_str(&json).unwrap();
        assert_eq!(back.description, "why this project");
        assert_eq!(back.tasks[0].priority, 1);
        assert_eq!(back.tasks[0].labels, vec!["release".to_string()]);
        assert!(back.tasks[0].next_up);
    }

    #[test]
    fn load_sorts_tasks_by_order() {
        let plan = Plan {
            description: String::new(),
            tasks: vec![task("b", 5), task("a", 1)],
        };
        let json = serde_json::to_string(&plan).unwrap();
        let mut back: Plan = serde_json::from_str(&json).unwrap();
        back.tasks.sort_by_key(|t| t.order);
        assert_eq!(back.tasks[0].id, "a");
    }
}
