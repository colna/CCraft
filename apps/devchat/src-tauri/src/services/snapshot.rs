use crate::models::{KeyFile, ProjectSnapshot, TechStack};
use serde_json::json;

pub fn generate_demo_snapshot() -> ProjectSnapshot {
    ProjectSnapshot {
        directory_tree: json!({ "src": ["App.tsx", "UserList.tsx"], "package": "package.json" }),
        tech_stack: TechStack {
            language: "TypeScript".into(),
            framework: "React + Vite".into(),
            dependencies: vec!["react".into(), "vite".into(), "zustand".into()],
        },
        key_files: vec![
            KeyFile {
                path: "src/App.tsx".into(),
                role: "root component".into(),
                summary: "应用入口组件".into(),
            },
            KeyFile {
                path: "src/UserList.tsx".into(),
                role: "feature component".into(),
                summary: "用户列表展示".into(),
            },
        ],
        module_map: json!({ "ui": ["src/App.tsx", "src/UserList.tsx"] }),
        generated_at: "2026-05-10T08:31:00.000Z".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::generate_demo_snapshot;

    #[test]
    fn includes_key_files() {
        let snapshot = generate_demo_snapshot();
        assert!(snapshot.key_files.iter().any(|file| file.path == "src/App.tsx"));
    }
}
