use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatSessionStatus {
    Active,
    Committed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiffHunk {
    pub header: String,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct SessionFileDiff {
    pub file_path: String,
    pub previous_file_path: Option<String>,
    #[serde(rename = "type")]
    pub change_type: String,
    pub hunks: Vec<SessionDiffHunk>,
    pub additions: u32,
    pub deletions: u32,
    pub raw_diff: String,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub project_id: String,
    pub repo_full_name: String,
    pub branch: String,
    pub title: String,
    pub messages: Vec<SessionMessage>,
    pub pending_changes: Vec<SessionFileDiff>,
    pub status: ChatSessionStatus,
    pub commit_sha: Option<String>,
    pub commit_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
