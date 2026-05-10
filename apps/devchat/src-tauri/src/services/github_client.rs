use crate::models::{CommitResult, FileChange, FileTree, Repository};

pub struct GitHubClient {
    token: String,
}

impl GitHubClient {
    pub fn new(token: &str) -> Self {
        Self { token: token.to_owned() }
    }

    pub async fn list_repos(&self, _page: u32, _per_page: u32) -> anyhow::Result<Vec<Repository>> {
        let _ = &self.token;
        Ok(vec![Repository {
            id: "repo_1".into(),
            owner: "colna".into(),
            name: "my-app".into(),
            full_name: "colna/my-app".into(),
            private: true,
            language: Some("TypeScript".into()),
            stars: 12,
            default_branch: "main".into(),
            updated_at: "2026-05-10T08:00:00.000Z".into(),
        }])
    }

    pub async fn get_tree(&self, _owner: &str, _repo: &str, _branch: &str) -> anyhow::Result<FileTree> {
        Ok(FileTree {
            files: vec!["package.json".into(), "src/App.tsx".into(), "src/UserList.tsx".into()],
        })
    }

    pub async fn commit_and_push(
        &self,
        _owner: &str,
        repo: &str,
        _branch: &str,
        changes: &[FileChange],
        _message: &str,
    ) -> anyhow::Result<CommitResult> {
        anyhow::ensure!(!changes.is_empty(), "no changes selected");
        Ok(CommitResult {
            sha: "demo1234".into(),
            html_url: Some(format!("https://github.com/colna/{repo}/commit/demo1234")),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::GitHubClient;
    use crate::models::FileChange;

    #[tokio::test]
    async fn refuses_empty_commits() {
        let client = GitHubClient::new("token");
        let result = client.commit_and_push("colna", "my-app", "main", &[], "msg").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn returns_commit_sha_for_selected_changes() {
        let client = GitHubClient::new("token");
        let change = FileChange {
            path: "src/App.tsx".into(),
            content: "export {}".into(),
            change_type: "modify".into(),
        };
        let result = client
            .commit_and_push("colna", "my-app", "main", &[change], "feat: demo")
            .await
            .unwrap();
        assert_eq!(result.sha, "demo1234");
    }
}
