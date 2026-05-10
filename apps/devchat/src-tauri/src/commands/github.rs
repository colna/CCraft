use crate::models::{CommitResult, FileChange, FileTree, Repository};
use crate::services::github_client::GitHubClient;

#[tauri::command]
pub async fn github_list_repos(token: String, page: u32, per_page: u32) -> Result<Vec<Repository>, String> {
    GitHubClient::new(&token)
        .list_repos(page, per_page)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn github_get_tree(token: String, owner: String, repo: String, branch: String) -> Result<FileTree, String> {
    GitHubClient::new(&token)
        .get_tree(&owner, &repo, &branch)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn github_commit_and_push(
    token: String,
    owner: String,
    repo: String,
    branch: String,
    changes: Vec<FileChange>,
    message: String,
) -> Result<CommitResult, String> {
    GitHubClient::new(&token)
        .commit_and_push(&owner, &repo, &branch, &changes, &message)
        .await
        .map_err(|error| error.to_string())
}
