use crate::models::{KeyFile, ProjectSnapshot, TechStack};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn generate_snapshot_from_files(files: &[String]) -> ProjectSnapshot {
    ProjectSnapshot {
        directory_tree: build_directory_tree(files),
        tech_stack: detect_tech_stack(files),
        key_files: detect_key_files(files),
        module_map: build_module_map(files),
        generated_at: generated_at(),
    }
}

fn build_directory_tree(files: &[String]) -> Value {
    let mut root = Map::new();

    for file in files {
        let parts = file.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
        insert_path(&mut root, &parts);
    }

    Value::Object(root)
}

fn insert_path(node: &mut Map<String, Value>, parts: &[&str]) {
    let Some((head, tail)) = parts.split_first() else {
        return;
    };

    if tail.is_empty() {
        node.insert((*head).to_owned(), Value::String("file".to_owned()));
        return;
    }

    let child = node
        .entry((*head).to_owned())
        .or_insert_with(|| Value::Object(Map::new()));

    if let Value::Object(child_map) = child {
        insert_path(child_map, tail);
    }
}

fn detect_tech_stack(files: &[String]) -> TechStack {
    let has_typescript = files.iter().any(|file| file.ends_with(".ts") || file.ends_with(".tsx"));
    let has_javascript = files.iter().any(|file| file.ends_with(".js") || file.ends_with(".jsx"));
    let has_rust = files.iter().any(|file| file.ends_with(".rs") || file.ends_with("Cargo.toml"));
    let has_react = files.iter().any(|file| file.ends_with(".tsx") || file.ends_with(".jsx"));
    let has_vite = files.iter().any(|file| file.starts_with("vite.config."));
    let has_next = files.iter().any(|file| file.starts_with("next.config."));
    let has_tauri = files.iter().any(|file| file.starts_with("src-tauri/"));

    let language = if has_typescript {
        "TypeScript"
    } else if has_javascript {
        "JavaScript"
    } else if has_rust {
        "Rust"
    } else {
        "Unknown"
    };

    let framework = if has_tauri && has_react {
        "Tauri + React"
    } else if has_next {
        "Next.js"
    } else if has_vite && has_react {
        "React + Vite"
    } else if has_rust {
        "Rust"
    } else {
        "Unknown"
    };

    let mut dependencies = Vec::new();
    if has_react {
        dependencies.push("react".to_owned());
    }
    if has_vite {
        dependencies.push("vite".to_owned());
    }
    if has_next {
        dependencies.push("next".to_owned());
    }
    if has_tauri {
        dependencies.push("tauri".to_owned());
    }

    TechStack {
        language: language.to_owned(),
        framework: framework.to_owned(),
        dependencies,
    }
}

fn detect_key_files(files: &[String]) -> Vec<KeyFile> {
    let priority = [
        ("package.json", "package manifest", "前端依赖与脚本入口"),
        ("Cargo.toml", "rust manifest", "Rust crate 配置入口"),
        ("src-tauri/Cargo.toml", "tauri manifest", "Tauri Rust core 配置入口"),
        ("src/main.tsx", "frontend entry", "React 应用入口"),
        ("src/App.tsx", "root component", "前端根组件"),
        ("app/page.tsx", "next route", "Next.js 首页路由"),
        ("vite.config.ts", "build config", "Vite 构建配置"),
        ("next.config.ts", "next config", "Next.js 构建配置"),
    ];

    priority
        .iter()
        .filter(|(path, _, _)| files.iter().any(|file| file == path))
        .map(|(path, role, summary)| KeyFile {
            path: (*path).to_owned(),
            role: (*role).to_owned(),
            summary: (*summary).to_owned(),
        })
        .collect()
}

fn build_module_map(files: &[String]) -> Value {
    let mut modules = BTreeMap::<String, Vec<String>>::new();

    for file in files {
        let module = file.split('/').next().unwrap_or("root").to_owned();
        modules.entry(module).or_default().push(file.to_owned());
    }

    json!(modules)
}

fn generated_at() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::generate_snapshot_from_files;

    #[test]
    fn includes_key_files() {
        let files = vec![
            "package.json".to_owned(),
            "src/App.tsx".to_owned(),
            "src/UserList.tsx".to_owned(),
            "vite.config.ts".to_owned(),
        ];
        let snapshot = generate_snapshot_from_files(&files);
        assert!(snapshot.key_files.iter().any(|file| file.path == "src/App.tsx"));
    }

    #[test]
    fn builds_snapshot_from_repository_file_paths() {
        let files = vec![
            "package.json".to_owned(),
            "vite.config.ts".to_owned(),
            "src/main.tsx".to_owned(),
            "src/App.tsx".to_owned(),
            "src-tauri/Cargo.toml".to_owned(),
        ];

        let snapshot = generate_snapshot_from_files(&files);

        assert_eq!(snapshot.tech_stack.language, "TypeScript");
        assert_eq!(snapshot.tech_stack.framework, "Tauri + React");
        assert!(snapshot.tech_stack.dependencies.contains(&"react".to_owned()));
        assert!(snapshot.key_files.iter().any(|file| file.path == "src-tauri/Cargo.toml"));
        assert_eq!(snapshot.directory_tree["src"]["App.tsx"], "file");
        assert_eq!(snapshot.module_map["src"][0], "src/main.tsx");
    }
}
