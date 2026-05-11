use crate::models::{GitHubApiError, ProjectSnapshot, SkippedFile};
use crate::services::github_client::GitHubClient;
use crate::services::snapshot::{generate_snapshot_from_repository, snapshot_candidate_paths};
use tauri::AppHandle;

#[tauri::command]
pub async fn generate_snapshot(
    app: AppHandle,
    token_secret_ref: String,
    owner: String,
    repo: String,
    branch: String,
) -> Result<ProjectSnapshot, String> {
    let token = crate::commands::storage::get_secret_value(&app, &token_secret_ref)?;
    let client = GitHubClient::new(&token);
    let tree = client
        .get_tree(&owner, &repo, &branch)
        .await
        .map_err(|error| error.to_string())?;
    let mut file_contents = Vec::new();
    let mut skipped_files = Vec::new();

    for path in snapshot_candidate_paths(&tree.files) {
        match client.get_file_content(&owner, &repo, &branch, &path).await {
            Ok(file) => file_contents.push(file),
            Err(error) => skipped_files.push(SkippedFile {
                path,
                reason: github_error_reason(&error),
            }),
        }
    }

    Ok(generate_snapshot_from_repository(
        &tree.files,
        &file_contents,
        &skipped_files,
    ))
}

fn github_error_reason(error: &GitHubApiError) -> String {
    let code = serde_json::to_value(&error.code)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "unknown".to_owned());
    format!("api_error:{code}")
}
