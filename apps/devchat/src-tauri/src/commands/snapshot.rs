use crate::models::ProjectSnapshot;
use crate::services::github_client::GitHubClient;
use crate::services::snapshot::generate_snapshot_from_files;
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
    let tree = GitHubClient::new(&token)
        .get_tree(&owner, &repo, &branch)
        .await
        .map_err(|error| error.to_string())?;

    Ok(generate_snapshot_from_files(&tree.files))
}
