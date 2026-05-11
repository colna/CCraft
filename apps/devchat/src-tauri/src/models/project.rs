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
pub struct Branch {
    pub name: String,
    pub sha: String,
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTree {
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFileContent {
    pub path: String,
    pub sha: String,
    pub size: u64,
    pub content: Option<String>,
    pub skipped_reason: Option<RepositoryFileSkipReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RepositoryFileSkipReason {
    TooLarge,
    Binary,
    GitLfsPointer,
    UnsupportedEncoding,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubApiError {
    pub code: GitHubApiErrorCode,
    pub message: String,
    pub status: Option<u16>,
    pub retry_after_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitHubApiErrorCode {
    InvalidInput,
    NotFound,
    RateLimited,
    Unauthorized,
    Forbidden,
    InvalidResponse,
    Network,
    Unknown,
}

impl GitHubApiError {
    pub fn new(code: GitHubApiErrorCode, message: impl Into<String>, status: Option<u16>) -> Self {
        Self {
            code,
            message: message.into(),
            status,
            retry_after_seconds: None,
        }
    }

    pub fn with_retry_after(mut self, retry_after_seconds: Option<u64>) -> Self {
        self.retry_after_seconds = retry_after_seconds;
        self
    }
}

impl std::fmt::Display for GitHubApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{} ({:?})", self.message, self.code)
    }
}

impl std::error::Error for GitHubApiError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub path: String,
    pub role: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
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
    #[serde(default)]
    pub skipped_files: Vec<SkippedFile>,
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
    pub branch_sha: Option<String>,
    pub snapshot: Option<ProjectSnapshot>,
    pub last_accessed: String,
}
