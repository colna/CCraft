use crate::models::{CommitResult, FileChange, FileTree, Repository};
use crate::services::github_client::GitHubClient;
use tauri::AppHandle;

#[tauri::command]
pub async fn github_list_repos(
    app: AppHandle,
    token_secret_ref: String,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<Repository>, String> {
    let token = crate::commands::storage::get_secret_value(&app, &token_secret_ref)?;
    GitHubClient::new(&token)
        .list_repos(page.unwrap_or(1), per_page.unwrap_or(50))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn github_get_tree(
    app: AppHandle,
    token_secret_ref: String,
    owner: String,
    repo: String,
    branch: String,
) -> Result<FileTree, String> {
    let token = crate::commands::storage::get_secret_value(&app, &token_secret_ref)?;
    GitHubClient::new(&token)
        .get_tree(&owner, &repo, &branch)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn github_commit_and_push(
    app: AppHandle,
    token_secret_ref: String,
    owner: String,
    repo: String,
    branch: String,
    changes: Vec<FileChange>,
    message: String,
) -> Result<CommitResult, String> {
    let token = crate::commands::storage::get_secret_value(&app, &token_secret_ref)?;
    GitHubClient::new(&token)
        .commit_and_push(&owner, &repo, &branch, &changes, &message)
        .await
        .map_err(|error| error.to_string())
}
