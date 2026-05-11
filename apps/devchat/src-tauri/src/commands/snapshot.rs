use crate::models::{GitHubApiError, ProjectSnapshot, SkippedFile};
use crate::services::github_client::GitHubClient;
use crate::services::snapshot::{generate_snapshot_from_repository, snapshot_candidate_paths};
use crate::services::snapshot_cache::{
    empty_snapshot_cache, find_cached_snapshot, normalize_snapshot_cache, snapshot_cache_key,
    upsert_cached_snapshot, SnapshotCache, SnapshotCacheEntry,
};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const SNAPSHOT_CACHE_STORE_FILE: &str = "snapshot-cache.json";
const SNAPSHOT_CACHE_STORE_KEY: &str = "snapshotCache";

#[tauri::command]
pub async fn generate_snapshot(
    app: AppHandle,
    token_secret_ref: String,
    owner: String,
    repo: String,
    branch: String,
    cache_ref: Option<String>,
    refresh: Option<bool>,
    request_id: Option<String>,
) -> Result<ProjectSnapshot, String> {
    let request_id = request_id.unwrap_or_else(|| "snapshot".to_owned());
    emit_snapshot_progress(&app, &request_id, "start", 5, "准备项目快照")?;
    let token = crate::commands::storage::get_secret_value(&app, &token_secret_ref)?;
    let client = GitHubClient::new(&token);
    let resolved_ref = match cache_ref {
        Some(cache_ref) if !cache_ref.trim().is_empty() => cache_ref,
        _ => client
            .get_branch(&owner, &repo, &branch)
            .await
            .map(|branch| branch.sha)
            .unwrap_or_else(|_| branch.clone()),
    };
    let cache_key = snapshot_cache_key(&owner, &repo, &branch, &resolved_ref);

    if refresh != Some(true) {
        if let Some(snapshot) = find_cached_snapshot(&load_snapshot_cache(&app)?, &cache_key) {
            emit_snapshot_progress(&app, &request_id, "cache_hit", 100, "已读取缓存快照")?;
            return Ok(snapshot);
        }
    }

    emit_snapshot_progress(&app, &request_id, "tree", 20, "读取 GitHub 文件树")?;
    let tree = client
        .get_tree(&owner, &repo, &branch)
        .await
        .map_err(|error| error.to_string())?;
    let mut file_contents = Vec::new();
    let mut skipped_files = Vec::new();
    let candidates = snapshot_candidate_paths(&tree.files);

    for (index, path) in candidates.iter().enumerate() {
        let percent = 35 + ((index as f32 / candidates.len().max(1) as f32) * 45.0) as u8;
        emit_snapshot_progress(&app, &request_id, "content", percent, path)?;
        match client.get_file_content(&owner, &repo, &branch, &path).await {
            Ok(file) => file_contents.push(file),
            Err(error) => skipped_files.push(SkippedFile {
                path: path.clone(),
                reason: github_error_reason(&error),
            }),
        }
    }

    emit_snapshot_progress(&app, &request_id, "analyze", 85, "分析项目结构")?;
    let snapshot = generate_snapshot_from_repository(&tree.files, &file_contents, &skipped_files);
    save_snapshot_cache_entry(
        &app,
        SnapshotCacheEntry {
            key: cache_key,
            owner,
            repo,
            branch,
            cache_ref: resolved_ref,
            snapshot: snapshot.clone(),
            updated_at: generated_at(),
        },
    )?;
    emit_snapshot_progress(&app, &request_id, "done", 100, "快照已更新")?;

    Ok(snapshot)
}

fn github_error_reason(error: &GitHubApiError) -> String {
    let code = serde_json::to_value(&error.code)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "unknown".to_owned());
    format!("api_error:{code}")
}

fn load_snapshot_cache(app: &AppHandle) -> Result<SnapshotCache, String> {
    let store = app
        .store(SNAPSHOT_CACHE_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let cache = match store.get(SNAPSHOT_CACHE_STORE_KEY) {
        Some(value) => serde_json::from_value::<SnapshotCache>(value.clone())
            .map_err(|error| error.to_string())?,
        None => empty_snapshot_cache(),
    };

    Ok(normalize_snapshot_cache(cache))
}

fn save_snapshot_cache_entry(app: &AppHandle, entry: SnapshotCacheEntry) -> Result<(), String> {
    let cache = upsert_cached_snapshot(load_snapshot_cache(app)?, entry);
    let store = app
        .store(SNAPSHOT_CACHE_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let value = serde_json::to_value(cache).map_err(|error| error.to_string())?;
    store.set(SNAPSHOT_CACHE_STORE_KEY.to_owned(), value);
    store.save().map_err(|error| error.to_string())
}

fn emit_snapshot_progress(
    app: &AppHandle,
    request_id: &str,
    phase: &str,
    percent: u8,
    message: &str,
) -> Result<(), String> {
    app.emit(
        "snapshot-progress",
        SnapshotProgressEvent {
            request_id: request_id.to_owned(),
            phase: phase.to_owned(),
            percent,
            message: message.to_owned(),
        },
    )
    .map_err(|error| error.to_string())
}

fn generated_at() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotProgressEvent {
    request_id: String,
    phase: String,
    percent: u8,
    message: String,
}
