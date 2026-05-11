use crate::models::{Branch, CommitResult, FileChange, FileTree, Repository};
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Deserialize;

pub struct GitHubClient {
    token: String,
    base_url: String,
    http: reqwest::Client,
}

impl GitHubClient {
    pub fn new(token: &str) -> Self {
        Self::with_base_url(token, "https://api.github.com")
    }

    pub fn with_base_url(token: &str, base_url: &str) -> Self {
        Self {
            token: token.to_owned(),
            base_url: base_url.trim_end_matches('/').to_owned(),
            http: reqwest::Client::new(),
        }
    }

    pub async fn list_repos(&self, page: u32, per_page: u32) -> anyhow::Result<Vec<Repository>> {
        let repos = self
            .github_get(&format!("{}/user/repos", self.base_url))
            .query(&[
                ("visibility", "all".to_owned()),
                ("sort", "updated".to_owned()),
                ("page", page.max(1).to_string()),
                ("per_page", per_page.clamp(1, 100).to_string()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<GitHubRepo>>()
            .await?;

        Ok(repos.into_iter().map(Repository::from).collect())
    }

    pub async fn get_tree(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> anyhow::Result<FileTree> {
        let tree = self
            .github_get(&format!(
                "{}/repos/{}/{}/git/trees/{}",
                self.base_url,
                encode_path_segment(owner),
                encode_path_segment(repo),
                encode_path_segment(branch)
            ))
            .query(&[("recursive", "1")])
            .send()
            .await?
            .error_for_status()?
            .json::<GitHubTreeResponse>()
            .await?;

        anyhow::ensure!(
            !tree.truncated,
            "GitHub tree response was truncated; refresh with a narrower tree is not implemented yet"
        );

        let files = tree
            .tree
            .into_iter()
            .filter(|entry| entry.kind == "blob")
            .map(|entry| entry.path)
            .collect();

        Ok(FileTree { files })
    }

    pub async fn list_branches(&self, owner: &str, repo: &str) -> anyhow::Result<Vec<Branch>> {
        let branches = self
            .github_get(&format!(
                "{}/repos/{}/{}/branches",
                self.base_url,
                encode_path_segment(owner),
                encode_path_segment(repo)
            ))
            .query(&[("per_page", "100")])
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<GitHubBranch>>()
            .await?;

        Ok(branches.into_iter().map(Branch::from).collect())
    }

    pub async fn get_branch(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> anyhow::Result<Branch> {
        let branch = self
            .github_get(&format!(
                "{}/repos/{}/{}/branches/{}",
                self.base_url,
                encode_path_segment(owner),
                encode_path_segment(repo),
                encode_path_segment(branch)
            ))
            .send()
            .await?
            .error_for_status()?
            .json::<GitHubBranch>()
            .await?;

        Ok(Branch::from(branch))
    }

    pub async fn commit_and_push(
        &self,
        _owner: &str,
        _repo: &str,
        _branch: &str,
        changes: &[FileChange],
        _message: &str,
    ) -> anyhow::Result<CommitResult> {
        anyhow::ensure!(!changes.is_empty(), "no changes selected");
        anyhow::bail!(
            "真实 Commit & Push 尚未接入，请按 docs/任务计划.md 的 R5.1 实现 GitHub Git Data API 提交流程"
        )
    }

    fn github_get(&self, url: &str) -> reqwest::RequestBuilder {
        self.http
            .get(url)
            .bearer_auth(&self.token)
            .header(USER_AGENT, "DevChat")
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
    }
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct GitHubOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRepo {
    id: serde_json::Value,
    owner: GitHubOwner,
    name: String,
    full_name: String,
    private: bool,
    language: Option<String>,
    stargazers_count: u32,
    default_branch: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GitHubBranch {
    name: String,
    commit: GitHubBranchCommit,
    protected: bool,
}

#[derive(Debug, Deserialize)]
struct GitHubBranchCommit {
    sha: String,
}

impl From<GitHubRepo> for Repository {
    fn from(repo: GitHubRepo) -> Self {
        Self {
            id: repo
                .id
                .as_str()
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| repo.id.to_string()),
            owner: repo.owner.login,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            language: repo.language,
            stars: repo.stargazers_count,
            default_branch: repo.default_branch,
            updated_at: repo.updated_at,
        }
    }
}

impl From<GitHubBranch> for Branch {
    fn from(branch: GitHubBranch) -> Self {
        Self {
            name: branch.name,
            sha: branch.commit.sha,
            protected: branch.protected,
        }
    }
}

#[derive(Debug, Deserialize)]
struct GitHubTreeResponse {
    tree: Vec<GitHubTreeEntry>,
    truncated: bool,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeEntry {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

#[cfg(test)]
mod tests {
    use super::GitHubClient;
    use crate::models::FileChange;
    use std::net::SocketAddr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn lists_repositories_from_github_api() {
        let body = r#"[{
            "id": 42,
            "owner": { "login": "colna" },
            "name": "ccraft",
            "full_name": "colna/ccraft",
            "private": true,
            "language": "TypeScript",
            "stargazers_count": 9,
            "default_branch": "main",
            "updated_at": "2026-05-11T00:00:00Z"
        }]"#;
        let addr = spawn_github_server(body, |request| {
            assert!(request.starts_with("GET /user/repos?"));
            assert!(request.contains("visibility=all"));
            assert!(request.contains("sort=updated"));
            assert!(request.contains("page=2"));
            assert!(request.contains("per_page=25"));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer ghp_test"));
        })
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let repos = client.list_repos(2, 25).await.unwrap();

        assert_eq!(repos[0].id, "42");
        assert_eq!(repos[0].owner, "colna");
        assert_eq!(repos[0].full_name, "colna/ccraft");
        assert_eq!(repos[0].stars, 9);
    }

    #[tokio::test]
    async fn loads_repository_tree_files_from_github_api() {
        let body = r#"{
            "tree": [
                { "path": "package.json", "type": "blob" },
                { "path": "src", "type": "tree" },
                { "path": "src/main.tsx", "type": "blob" }
            ],
            "truncated": false
        }"#;
        let addr = spawn_github_server(body, |request| {
            assert!(request
                .starts_with("GET /repos/colna/ccraft/git/trees/feature%2Fmobile?recursive=1 "));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer ghp_test"));
        })
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let tree = client
            .get_tree("colna", "ccraft", "feature/mobile")
            .await
            .unwrap();

        assert_eq!(tree.files, vec!["package.json", "src/main.tsx"]);
    }

    #[tokio::test]
    async fn lists_repository_branches_from_github_api() {
        let body = r#"[
            { "name": "main", "commit": { "sha": "abc123" }, "protected": true },
            { "name": "feature/mobile", "commit": { "sha": "def456" }, "protected": false }
        ]"#;
        let addr = spawn_github_server(body, |request| {
            assert!(request.starts_with("GET /repos/colna/ccraft/branches?per_page=100 "));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer ghp_test"));
        })
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let branches = client.list_branches("colna", "ccraft").await.unwrap();

        assert_eq!(branches[0].name, "main");
        assert_eq!(branches[0].sha, "abc123");
        assert!(branches[0].protected);
        assert_eq!(branches[1].name, "feature/mobile");
    }

    #[tokio::test]
    async fn loads_branch_refs_with_encoded_branch_names() {
        let body =
            r#"{ "name": "feature/mobile", "commit": { "sha": "def456" }, "protected": false }"#;
        let addr = spawn_github_server(body, |request| {
            assert!(request.starts_with("GET /repos/colna/ccraft/branches/feature%2Fmobile "));
        })
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let branch = client
            .get_branch("colna", "ccraft", "feature/mobile")
            .await
            .unwrap();

        assert_eq!(branch.sha, "def456");
    }

    #[tokio::test]
    async fn refuses_empty_commits() {
        let client = GitHubClient::new("token");
        let result = client
            .commit_and_push("colna", "my-app", "main", &[], "msg")
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn reports_commit_adapter_as_not_implemented_for_selected_changes() {
        let client = GitHubClient::new("token");
        let change = FileChange {
            path: "src/App.tsx".into(),
            content: "export {}".into(),
            change_type: "modify".into(),
        };
        let result = client
            .commit_and_push("colna", "my-app", "main", &[change], "feat: test commit")
            .await;
        assert!(result.unwrap_err().to_string().contains("R5.1"));
    }

    async fn spawn_github_server<F>(body: &'static str, assert_request: F) -> SocketAddr
    where
        F: FnOnce(&str) + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 4096];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert_request(&request);

            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        addr
    }
}
