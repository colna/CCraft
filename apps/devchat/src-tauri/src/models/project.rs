use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub language: Option<String>,
    pub stars: u32,
    pub default_branch: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTree {
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub path: String,
    pub role: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechStack {
    pub language: String,
    pub framework: String,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub directory_tree: Value,
    pub tech_stack: TechStack,
    pub key_files: Vec<KeyFile>,
    pub module_map: Value,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub repo_id: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub repo_full_name: String,
    pub branch: String,
    pub snapshot: Option<ProjectSnapshot>,
    pub last_accessed: String,
}
