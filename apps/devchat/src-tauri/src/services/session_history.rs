use crate::models::{
    ChatSession, ChatSessionStatus, SessionDiffHunk, SessionFileDiff, SessionMessage,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SESSION_HISTORY_VERSION: u32 = 1;
const MAX_SESSIONS: usize = 100;
const MAX_MESSAGES_PER_SESSION: usize = 200;
const MAX_PENDING_CHANGES_PER_SESSION: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistory {
    pub version: u32,
    pub sessions: Vec<ChatSession>,
}

pub fn empty_session_history() -> SessionHistory {
    SessionHistory {
        version: SESSION_HISTORY_VERSION,
        sessions: Vec::new(),
    }
}

pub fn migrate_session_history_value(value: Value) -> anyhow::Result<SessionHistory> {
    let history = serde_json::from_value::<SessionHistory>(value)?;
    Ok(normalize_session_history(history))
}

pub fn normalize_session_history(mut history: SessionHistory) -> SessionHistory {
    if history.version != SESSION_HISTORY_VERSION {
        return empty_session_history();
    }

    history.sessions = history
        .sessions
        .into_iter()
        .filter_map(|session| normalize_chat_session(session).ok())
        .collect();
    sort_and_limit_sessions(&mut history.sessions);
    history.version = SESSION_HISTORY_VERSION;
    history
}

pub fn upsert_session(
    mut history: SessionHistory,
    session: ChatSession,
) -> anyhow::Result<SessionHistory> {
    let session = normalize_chat_session(session)?;
    history.version = SESSION_HISTORY_VERSION;
    history
        .sessions
        .retain(|existing| existing.id != session.id);
    history.sessions.insert(0, session);
    sort_and_limit_sessions(&mut history.sessions);
    Ok(history)
}

pub fn delete_session(mut history: SessionHistory, id: &str) -> anyhow::Result<SessionHistory> {
    let id = normalize_text(id, "session id", 120)?;
    history.sessions.retain(|session| session.id != id);
    history.version = SESSION_HISTORY_VERSION;
    Ok(history)
}

pub fn mark_session_committed(
    mut history: SessionHistory,
    id: &str,
    commit_sha: &str,
    commit_url: Option<String>,
    updated_at: &str,
) -> anyhow::Result<SessionHistory> {
    let id = normalize_text(id, "session id", 120)?;
    let commit_sha = normalize_text(commit_sha, "commit sha", 120)?;
    let updated_at = normalize_text(updated_at, "updated at", 80)?;

    let session = history
        .sessions
        .iter_mut()
        .find(|session| session.id == id)
        .ok_or_else(|| anyhow::anyhow!("session not found"))?;

    if let Some(commit_url) = &commit_url {
        validate_text(commit_url, "commit url", 300)?;
        anyhow::ensure!(
            commit_url.starts_with("https://github.com/"),
            "commit url must be a GitHub HTTPS URL"
        );
    }

    session.status = ChatSessionStatus::Committed;
    session.commit_sha = Some(commit_sha);
    session.commit_url = commit_url;
    session.pending_changes.clear();
    session.updated_at = updated_at;

    Ok(normalize_session_history(history))
}

pub fn normalize_chat_session(mut session: ChatSession) -> anyhow::Result<ChatSession> {
    session.id = normalize_text(&session.id, "session id", 120)?;
    session.project_id = normalize_text(&session.project_id, "project id", 240)?;
    session.repo_full_name = normalize_text(&session.repo_full_name, "repo full name", 240)?;
    session.branch = normalize_text(&session.branch, "branch", 240)?;
    session.title = normalize_text(&session.title, "session title", 120)?;
    session.created_at = normalize_text(&session.created_at, "created at", 80)?;
    session.updated_at = normalize_text(&session.updated_at, "updated at", 80)?;
    session.messages = normalize_messages(session.messages)?;
    session.pending_changes = normalize_pending_changes(session.pending_changes)?;

    if let Some(commit_sha) = &session.commit_sha {
        validate_text(commit_sha, "commit sha", 120)?;
    }
    if let Some(commit_url) = &session.commit_url {
        validate_text(commit_url, "commit url", 300)?;
        anyhow::ensure!(
            commit_url.starts_with("https://github.com/"),
            "commit url must be a GitHub HTTPS URL"
        );
    }
    if session.status == ChatSessionStatus::Committed {
        anyhow::ensure!(
            session.commit_sha.is_some(),
            "committed sessions require a commit sha"
        );
    }

    Ok(session)
}

fn normalize_messages(messages: Vec<SessionMessage>) -> anyhow::Result<Vec<SessionMessage>> {
    anyhow::ensure!(!messages.is_empty(), "session messages are required");
    let mut normalized = Vec::new();
    for mut message in messages.into_iter().take(MAX_MESSAGES_PER_SESSION) {
        message.id = normalize_text(&message.id, "message id", 120)?;
        message.role = normalize_role(&message.role)?;
        validate_text(&message.content, "message content", 200_000)?;
        message.created_at = normalize_text(&message.created_at, "message created at", 80)?;
        normalized.push(message);
    }
    Ok(normalized)
}

fn normalize_pending_changes(
    changes: Vec<SessionFileDiff>,
) -> anyhow::Result<Vec<SessionFileDiff>> {
    changes
        .into_iter()
        .take(MAX_PENDING_CHANGES_PER_SESSION)
        .map(normalize_file_diff)
        .collect()
}

fn normalize_file_diff(mut diff: SessionFileDiff) -> anyhow::Result<SessionFileDiff> {
    diff.file_path = normalize_repository_path(&diff.file_path)?;
    if let Some(previous_file_path) = &diff.previous_file_path {
        diff.previous_file_path = Some(normalize_repository_path(previous_file_path)?);
    }
    diff.change_type = match diff.change_type.trim() {
        "added" | "modified" | "deleted" | "renamed" => diff.change_type.trim().to_owned(),
        _ => anyhow::bail!("unsupported pending change type"),
    };
    diff.hunks = diff
        .hunks
        .into_iter()
        .map(normalize_diff_hunk)
        .collect::<anyhow::Result<Vec<_>>>()?;
    validate_text(&diff.raw_diff, "raw diff", 1_000_000)?;
    Ok(diff)
}

fn normalize_diff_hunk(mut hunk: SessionDiffHunk) -> anyhow::Result<SessionDiffHunk> {
    hunk.header = normalize_text(&hunk.header, "diff hunk header", 240)?;
    anyhow::ensure!(hunk.lines.len() <= 2_000, "diff hunk has too many lines");
    for line in &hunk.lines {
        validate_text(line, "diff hunk line", 20_000)?;
    }
    Ok(hunk)
}

fn normalize_role(role: &str) -> anyhow::Result<String> {
    match role.trim() {
        "user" | "assistant" | "system" => Ok(role.trim().to_owned()),
        _ => anyhow::bail!("unsupported message role"),
    }
}

fn normalize_repository_path(path: &str) -> anyhow::Result<String> {
    let path = path.trim_matches('/');
    anyhow::ensure!(!path.is_empty(), "repository file path is required");
    for segment in path.split('/') {
        anyhow::ensure!(
            !(segment.is_empty() || segment == "." || segment == ".."),
            "repository file path contains an unsafe segment"
        );
    }
    Ok(path.to_owned())
}

fn normalize_text(value: &str, label: &str, max_len: usize) -> anyhow::Result<String> {
    let value = value.trim();
    validate_text(value, label, max_len)?;
    Ok(value.to_owned())
}

fn validate_text(value: &str, label: &str, max_len: usize) -> anyhow::Result<()> {
    anyhow::ensure!(!value.trim().is_empty(), "{label} is required");
    anyhow::ensure!(value.len() <= max_len, "{label} is too long");
    Ok(())
}

fn sort_and_limit_sessions(sessions: &mut Vec<ChatSession>) {
    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    sessions.truncate(MAX_SESSIONS);
}

#[cfg(test)]
mod tests {
    use super::{
        delete_session, empty_session_history, mark_session_committed,
        migrate_session_history_value, normalize_session_history, upsert_session, SessionHistory,
    };
    use crate::models::{
        ChatSession, ChatSessionStatus, SessionDiffHunk, SessionFileDiff, SessionMessage,
    };
    use serde_json::json;

    #[test]
    fn upserts_sessions_and_keeps_most_recent_first() {
        let first = session("s1", "2026-05-11T00:00:00Z");
        let latest = session("s2", "2026-05-11T01:00:00Z");

        let history = upsert_session(empty_session_history(), first).unwrap();
        let history = upsert_session(history, latest).unwrap();

        assert_eq!(history.version, 1);
        assert_eq!(history.sessions[0].id, "s2");
        assert_eq!(history.sessions[1].id, "s1");
    }

    #[test]
    fn safely_ignores_unknown_session_history_versions() {
        let history = normalize_session_history(SessionHistory {
            version: 99,
            sessions: vec![session("s1", "2026-05-11T00:00:00Z")],
        });

        assert!(history.sessions.is_empty());
        assert_eq!(history.version, 1);
    }

    #[test]
    fn rejects_plaintext_secret_fields_in_session_store_payloads() {
        let value = json!({
            "version": 1,
            "sessions": [{
                "id": "s1",
                "projectId": "colna/ccraft#main",
                "repoFullName": "colna/ccraft",
                "branch": "main",
                "title": "Fix login",
                "messages": [message("m1", "user", "Fix login")],
                "pendingChanges": [],
                "status": "active",
                "commitSha": null,
                "commitUrl": null,
                "createdAt": "2026-05-11T00:00:00Z",
                "updatedAt": "2026-05-11T00:00:00Z",
                "apiKey": "should-not-be-here"
            }]
        });

        assert!(migrate_session_history_value(value).is_err());
    }

    #[test]
    fn marks_sessions_committed_and_clears_pending_changes() {
        let mut active = session("s1", "2026-05-11T00:00:00Z");
        active.pending_changes = vec![diff()];
        let history = upsert_session(empty_session_history(), active).unwrap();

        let history = mark_session_committed(
            history,
            "s1",
            "abc123",
            Some("https://github.com/colna/ccraft/commit/abc123".to_owned()),
            "2026-05-11T01:00:00Z",
        )
        .unwrap();

        let session = &history.sessions[0];
        assert_eq!(session.status, ChatSessionStatus::Committed);
        assert_eq!(session.commit_sha.as_deref(), Some("abc123"));
        assert!(session.pending_changes.is_empty());
    }

    #[test]
    fn deletes_sessions_by_id() {
        let history = upsert_session(
            empty_session_history(),
            session("s1", "2026-05-11T00:00:00Z"),
        )
        .unwrap();

        let history = delete_session(history, "s1").unwrap();

        assert!(history.sessions.is_empty());
    }

    fn session(id: &str, updated_at: &str) -> ChatSession {
        ChatSession {
            id: id.to_owned(),
            project_id: "colna/ccraft#main".to_owned(),
            repo_full_name: "colna/ccraft".to_owned(),
            branch: "main".to_owned(),
            title: "Fix login".to_owned(),
            messages: vec![message("m1", "user", "Fix login")],
            pending_changes: Vec::new(),
            status: ChatSessionStatus::Active,
            commit_sha: None,
            commit_url: None,
            created_at: "2026-05-11T00:00:00Z".to_owned(),
            updated_at: updated_at.to_owned(),
        }
    }

    fn message(id: &str, role: &str, content: &str) -> SessionMessage {
        SessionMessage {
            id: id.to_owned(),
            role: role.to_owned(),
            content: content.to_owned(),
            created_at: "2026-05-11T00:00:00Z".to_owned(),
        }
    }

    fn diff() -> SessionFileDiff {
        SessionFileDiff {
            file_path: "src/App.tsx".to_owned(),
            previous_file_path: None,
            change_type: "modified".to_owned(),
            hunks: vec![SessionDiffHunk {
                header: "@@ -1 +1 @@".to_owned(),
                lines: vec!["-old".to_owned(), "+new".to_owned()],
            }],
            additions: 1,
            deletions: 1,
            raw_diff: "--- a/src/App.tsx\n+++ b/src/App.tsx".to_owned(),
            selected: true,
        }
    }
}
