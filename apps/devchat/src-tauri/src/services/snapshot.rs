use crate::models::{
    KeyFile, ProjectSnapshot, RepositoryFileContent, RepositoryFileSkipReason, SkippedFile,
    TechStack,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn generate_snapshot_from_files(files: &[String]) -> ProjectSnapshot {
    generate_snapshot_from_repository(files, &[], &[])
}

pub fn generate_snapshot_from_repository(
    files: &[String],
    file_contents: &[RepositoryFileContent],
    additional_skipped_files: &[SkippedFile],
) -> ProjectSnapshot {
    let content_by_path = content_map(file_contents);

    ProjectSnapshot {
        directory_tree: build_directory_tree(files),
        tech_stack: detect_tech_stack(files, &content_by_path),
        key_files: detect_key_files(files, &content_by_path),
        module_map: build_module_map(files),
        skipped_files: skipped_files(file_contents, additional_skipped_files),
        generated_at: generated_at(),
    }
}

pub fn snapshot_candidate_paths(files: &[String]) -> Vec<String> {
    let priority = [
        "package.json",
        "Cargo.toml",
        "src-tauri/Cargo.toml",
        "vite.config.ts",
        "vite.config.js",
        "next.config.ts",
        "next.config.js",
        "src/main.tsx",
        "src/main.jsx",
        "src/App.tsx",
        "src/App.jsx",
        "app/page.tsx",
        "pages/index.tsx",
    ];

    priority
        .iter()
        .filter(|path| files.iter().any(|file| file == **path))
        .map(|path| (*path).to_owned())
        .collect()
}

fn content_map(file_contents: &[RepositoryFileContent]) -> HashMap<&str, &str> {
    file_contents
        .iter()
        .filter_map(|file| {
            file.content
                .as_deref()
                .map(|content| (file.path.as_str(), content))
        })
        .collect()
}

fn build_directory_tree(files: &[String]) -> Value {
    let mut root = Map::new();

    for file in files {
        let parts = file
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
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

fn detect_tech_stack(files: &[String], content_by_path: &HashMap<&str, &str>) -> TechStack {
    let package_deps = content_by_path
        .get("package.json")
        .map(|content| package_dependencies(content))
        .unwrap_or_default();
    let cargo_deps = ["Cargo.toml", "src-tauri/Cargo.toml"]
        .iter()
        .filter_map(|path| {
            content_by_path
                .get(path)
                .map(|content| cargo_dependencies(content))
        })
        .flatten()
        .collect::<BTreeSet<_>>();

    let has_typescript = files
        .iter()
        .any(|file| file.ends_with(".ts") || file.ends_with(".tsx"))
        || package_deps.contains("typescript")
        || files.iter().any(|file| file == "tsconfig.json");
    let has_javascript = files
        .iter()
        .any(|file| file.ends_with(".js") || file.ends_with(".jsx"));
    let has_rust = files
        .iter()
        .any(|file| file.ends_with(".rs") || file.ends_with("Cargo.toml"));
    let has_react = package_deps.contains("react")
        || files
            .iter()
            .any(|file| file.ends_with(".tsx") || file.ends_with(".jsx"));
    let has_vite =
        package_deps.contains("vite") || files.iter().any(|file| file.starts_with("vite.config."));
    let has_next =
        package_deps.contains("next") || files.iter().any(|file| file.starts_with("next.config."));
    let has_tauri = cargo_deps.contains("tauri")
        || package_deps.contains("@tauri-apps/api")
        || files.iter().any(|file| file.starts_with("src-tauri/"));

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
    } else if has_react {
        "React"
    } else if has_rust {
        "Rust"
    } else {
        "Unknown"
    };

    let mut dependencies = BTreeSet::new();
    dependencies.extend(package_deps);
    dependencies.extend(cargo_deps);
    if has_react {
        dependencies.insert("react".to_owned());
    }
    if has_vite {
        dependencies.insert("vite".to_owned());
    }
    if has_next {
        dependencies.insert("next".to_owned());
    }
    if has_tauri {
        dependencies.insert("tauri".to_owned());
    }

    TechStack {
        language: language.to_owned(),
        framework: framework.to_owned(),
        dependencies: dependencies.into_iter().take(24).collect(),
    }
}

fn detect_key_files(files: &[String], content_by_path: &HashMap<&str, &str>) -> Vec<KeyFile> {
    let priority = [
        ("package.json", "package manifest", "前端依赖与脚本入口"),
        ("Cargo.toml", "rust manifest", "Rust crate 配置入口"),
        (
            "src-tauri/Cargo.toml",
            "tauri manifest",
            "Tauri Rust core 配置入口",
        ),
        ("src/main.tsx", "frontend entry", "React 应用入口"),
        ("src/main.jsx", "frontend entry", "React 应用入口"),
        ("src/App.tsx", "root component", "前端根组件"),
        ("src/App.jsx", "root component", "前端根组件"),
        ("app/page.tsx", "next route", "Next.js 首页路由"),
        ("pages/index.tsx", "next route", "Next.js Pages 首页路由"),
        ("vite.config.ts", "build config", "Vite 构建配置"),
        ("vite.config.js", "build config", "Vite 构建配置"),
        ("next.config.ts", "next config", "Next.js 构建配置"),
        ("next.config.js", "next config", "Next.js 构建配置"),
    ];

    priority
        .iter()
        .filter(|(path, _, _)| files.iter().any(|file| file == path))
        .map(|(path, role, default_summary)| KeyFile {
            path: (*path).to_owned(),
            role: (*role).to_owned(),
            summary: summarize_key_file(path, default_summary, content_by_path),
        })
        .collect()
}

fn summarize_key_file(
    path: &str,
    default_summary: &str,
    content_by_path: &HashMap<&str, &str>,
) -> String {
    let Some(content) = content_by_path.get(path) else {
        return default_summary.to_owned();
    };

    if path == "package.json" {
        return summarize_package_json(content).unwrap_or_else(|| default_summary.to_owned());
    }

    if path.ends_with("Cargo.toml") {
        return summarize_cargo_toml(content).unwrap_or_else(|| default_summary.to_owned());
    }

    let imports = content
        .lines()
        .filter_map(|line| line.trim().strip_prefix("import "))
        .take(4)
        .map(|line| line.trim_end_matches(';').to_owned())
        .collect::<Vec<_>>();
    if imports.is_empty() {
        default_summary.to_owned()
    } else {
        format!("{default_summary}；imports: {}", imports.join(", "))
    }
}

fn build_module_map(files: &[String]) -> Value {
    let mut modules = BTreeMap::<String, Vec<String>>::new();

    for file in files {
        let module = file.split('/').next().unwrap_or("root").to_owned();
        modules.entry(module).or_default().push(file.to_owned());
    }

    json!(modules)
}

fn skipped_files(
    file_contents: &[RepositoryFileContent],
    additional_skipped_files: &[SkippedFile],
) -> Vec<SkippedFile> {
    let mut skipped = BTreeMap::<String, String>::new();

    for file in file_contents {
        if let Some(reason) = &file.skipped_reason {
            skipped.insert(file.path.clone(), skip_reason(reason).to_owned());
        }
    }

    for file in additional_skipped_files {
        skipped.insert(file.path.clone(), file.reason.clone());
    }

    skipped
        .into_iter()
        .map(|(path, reason)| SkippedFile { path, reason })
        .collect()
}

fn skip_reason(reason: &RepositoryFileSkipReason) -> &'static str {
    match reason {
        RepositoryFileSkipReason::TooLarge => "too_large",
        RepositoryFileSkipReason::Binary => "binary",
        RepositoryFileSkipReason::GitLfsPointer => "git_lfs_pointer",
        RepositoryFileSkipReason::UnsupportedEncoding => "unsupported_encoding",
        RepositoryFileSkipReason::Directory => "directory",
    }
}

fn package_dependencies(content: &str) -> BTreeSet<String> {
    let Some(package) = parse_package_json(content) else {
        return BTreeSet::new();
    };

    let mut dependencies = BTreeSet::new();
    if let Some(runtime_dependencies) = package.dependencies {
        dependencies.extend(runtime_dependencies.into_keys());
    }
    if let Some(dev_dependencies) = package.dev_dependencies {
        dependencies.extend(dev_dependencies.into_keys());
    }
    dependencies
}

fn summarize_package_json(content: &str) -> Option<String> {
    let package = parse_package_json(content)?;
    let scripts = package
        .scripts
        .unwrap_or_default()
        .into_keys()
        .take(6)
        .collect::<Vec<_>>();
    let dependencies = package_dependencies(content)
        .into_iter()
        .take(8)
        .collect::<Vec<_>>();

    Some(format!(
        "前端包配置；scripts: {}; dependencies: {}",
        if scripts.is_empty() {
            "none".to_owned()
        } else {
            scripts.join(", ")
        },
        if dependencies.is_empty() {
            "none".to_owned()
        } else {
            dependencies.join(", ")
        }
    ))
}

fn cargo_dependencies(content: &str) -> BTreeSet<String> {
    toml::from_str::<toml::Value>(content)
        .ok()
        .and_then(|value| {
            value
                .get("dependencies")
                .and_then(|dependencies| dependencies.as_table())
                .cloned()
        })
        .map(|dependencies| dependencies.into_iter().map(|(key, _)| key).collect())
        .unwrap_or_default()
}

fn summarize_cargo_toml(content: &str) -> Option<String> {
    let value = toml::from_str::<toml::Value>(content).ok()?;
    let package_name = value
        .get("package")
        .and_then(|package| package.get("name"))
        .and_then(|name| name.as_str())
        .unwrap_or("unknown");
    let dependencies = cargo_dependencies(content)
        .into_iter()
        .take(8)
        .collect::<Vec<_>>();

    Some(format!(
        "Rust crate {package_name}；dependencies: {}",
        if dependencies.is_empty() {
            "none".to_owned()
        } else {
            dependencies.join(", ")
        }
    ))
}

fn parse_package_json(content: &str) -> Option<PackageJson> {
    serde_json::from_str(content).ok()
}

fn generated_at() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[derive(Debug, Deserialize)]
struct PackageJson {
    scripts: Option<BTreeMap<String, Value>>,
    dependencies: Option<BTreeMap<String, Value>>,
    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<BTreeMap<String, Value>>,
}

#[cfg(test)]
mod tests {
    use super::{generate_snapshot_from_files, generate_snapshot_from_repository};
    use crate::models::{
        ProjectSnapshot, RepositoryFileContent, RepositoryFileSkipReason, SkippedFile,
    };

    #[test]
    fn includes_key_files() {
        let files = vec![
            "package.json".to_owned(),
            "src/App.tsx".to_owned(),
            "src/UserList.tsx".to_owned(),
            "vite.config.ts".to_owned(),
        ];
        let snapshot = generate_snapshot_from_files(&files);
        assert!(snapshot
            .key_files
            .iter()
            .any(|file| file.path == "src/App.tsx"));
    }

    #[test]
    fn builds_react_vite_snapshot_from_package_content() {
        let files = vec![
            "package.json".to_owned(),
            "tsconfig.json".to_owned(),
            "vite.config.ts".to_owned(),
            "src/main.tsx".to_owned(),
            "src/App.tsx".to_owned(),
        ];
        let contents = vec![text_file(
            "package.json",
            r#"{
                "scripts": { "dev": "vite", "build": "vite build", "test": "vitest run" },
                "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
                "devDependencies": { "typescript": "^5.0.0", "vite": "^7.0.0" }
            }"#,
        )];

        let snapshot = generate_snapshot_from_repository(&files, &contents, &[]);

        assert_eq!(snapshot.tech_stack.language, "TypeScript");
        assert_eq!(snapshot.tech_stack.framework, "React + Vite");
        assert!(snapshot
            .tech_stack
            .dependencies
            .contains(&"vite".to_owned()));
        assert!(snapshot
            .key_files
            .iter()
            .any(|file| file.path == "package.json"
                && file.summary.contains("scripts: build, dev, test")));
    }

    #[test]
    fn builds_next_snapshot_from_package_content() {
        let files = vec![
            "package.json".to_owned(),
            "next.config.ts".to_owned(),
            "app/page.tsx".to_owned(),
        ];
        let contents = vec![text_file(
            "package.json",
            r#"{
                "scripts": { "dev": "next dev" },
                "dependencies": { "next": "^16.0.0", "react": "^19.0.0" }
            }"#,
        )];

        let snapshot = generate_snapshot_from_repository(&files, &contents, &[]);

        assert_eq!(snapshot.tech_stack.framework, "Next.js");
        assert!(snapshot
            .tech_stack
            .dependencies
            .contains(&"next".to_owned()));
        assert!(snapshot
            .key_files
            .iter()
            .any(|file| file.path == "app/page.tsx"));
    }

    #[test]
    fn builds_tauri_rust_snapshot_from_package_and_cargo_content() {
        let files = vec![
            "package.json".to_owned(),
            "src/main.tsx".to_owned(),
            "src-tauri/Cargo.toml".to_owned(),
            "src-tauri/src/lib.rs".to_owned(),
        ];
        let contents = vec![
            text_file(
                "package.json",
                r#"{
                    "dependencies": { "@tauri-apps/api": "^2.0.0", "react": "^19.0.0" },
                    "devDependencies": { "vite": "^7.0.0", "typescript": "^5.0.0" }
                }"#,
            ),
            text_file(
                "src-tauri/Cargo.toml",
                r#"[package]
name = "devchat"
version = "0.1.0"

[dependencies]
tauri = "2"
tokio = "1"
"#,
            ),
        ];

        let snapshot = generate_snapshot_from_repository(&files, &contents, &[]);

        assert_eq!(snapshot.tech_stack.framework, "Tauri + React");
        assert!(snapshot
            .tech_stack
            .dependencies
            .contains(&"tauri".to_owned()));
        assert!(snapshot
            .key_files
            .iter()
            .any(|file| file.path == "src-tauri/Cargo.toml" && file.summary.contains("devchat")));
    }

    #[test]
    fn records_skipped_files_and_keeps_minimal_tree_when_content_fetch_fails() {
        let files = vec![
            "package.json".to_owned(),
            "src/main.tsx".to_owned(),
            "large.log".to_owned(),
        ];
        let contents = vec![RepositoryFileContent {
            path: "large.log".to_owned(),
            sha: "sha-large".to_owned(),
            size: 900_000,
            content: None,
            skipped_reason: Some(RepositoryFileSkipReason::TooLarge),
        }];
        let fetch_errors = vec![SkippedFile {
            path: "package.json".to_owned(),
            reason: "api_error:rate_limited".to_owned(),
        }];

        let snapshot = generate_snapshot_from_repository(&files, &contents, &fetch_errors);

        assert_eq!(snapshot.directory_tree["src"]["main.tsx"], "file");
        assert!(snapshot
            .skipped_files
            .iter()
            .any(|file| file.path == "large.log" && file.reason == "too_large"));
        assert!(snapshot
            .skipped_files
            .iter()
            .any(|file| file.path == "package.json" && file.reason == "api_error:rate_limited"));
    }

    #[test]
    fn deserializes_older_snapshots_without_skipped_files() {
        let snapshot = serde_json::from_value::<ProjectSnapshot>(serde_json::json!({
            "directoryTree": {},
            "techStack": {
                "language": "TypeScript",
                "framework": "React",
                "dependencies": ["react"]
            },
            "keyFiles": [],
            "moduleMap": {},
            "generatedAt": "unix:1778457600"
        }))
        .unwrap();

        assert!(snapshot.skipped_files.is_empty());
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
        assert!(snapshot
            .tech_stack
            .dependencies
            .contains(&"react".to_owned()));
        assert!(snapshot
            .key_files
            .iter()
            .any(|file| file.path == "src-tauri/Cargo.toml"));
        assert_eq!(snapshot.directory_tree["src"]["App.tsx"], "file");
        assert_eq!(snapshot.module_map["src"][0], "src/main.tsx");
        assert!(snapshot.skipped_files.is_empty());
    }

    fn text_file(path: &str, content: &str) -> RepositoryFileContent {
        RepositoryFileContent {
            path: path.to_owned(),
            sha: format!("sha-{path}"),
            size: content.len() as u64,
            content: Some(content.to_owned()),
            skipped_reason: None,
        }
    }
}
