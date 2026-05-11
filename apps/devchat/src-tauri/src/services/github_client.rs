use crate::models::{
    Branch, CommitResult, FileChange, FileTree, GitHubApiError, GitHubApiErrorCode, Repository,
    RepositoryFileContent, RepositoryFileSkipReason,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use reqwest::header::{HeaderMap, ACCEPT, USER_AGENT};
use serde::Deserialize;

const MAX_TEXT_FILE_BYTES: u64 = 512 * 1024;

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

    pub async fn get_file_content(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
        path: &str,
    ) -> Result<RepositoryFileContent, GitHubApiError> {
        let encoded_path = encode_repository_path(path)?;
        let response = self
            .github_get(&format!(
                "{}/repos/{}/{}/contents/{}",
                self.base_url,
                encode_path_segment(owner),
                encode_path_segment(repo),
                encoded_path
            ))
            .query(&[("ref", branch)])
            .send()
            .await
            .map_err(|error| {
                GitHubApiError::new(GitHubApiErrorCode::Network, error.to_string(), None)
            })?;

        if !response.status().is_success() {
            return Err(github_error_from_response(response).await);
        }

        let content = response
            .json::<GitHubContentResponse>()
            .await
            .map_err(|error| {
                GitHubApiError::new(GitHubApiErrorCode::InvalidResponse, error.to_string(), None)
            })?;

        repository_file_from_content_response(content)
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

fn encode_repository_path(path: &str) -> Result<String, GitHubApiError> {
    let path = path.trim_matches('/');
    if path.is_empty() {
        return Err(GitHubApiError::new(
            GitHubApiErrorCode::InvalidInput,
            "repository file path is required",
            None,
        ));
    }

    let mut encoded_segments = Vec::new();
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(GitHubApiError::new(
                GitHubApiErrorCode::InvalidInput,
                "repository file path contains an unsafe segment",
                None,
            ));
        }
        encoded_segments.push(encode_path_segment(segment));
    }

    Ok(encoded_segments.join("/"))
}

async fn github_error_from_response(response: reqwest::Response) -> GitHubApiError {
    let status = response.status();
    let headers = response.headers().clone();
    let message = response
        .json::<GitHubErrorResponse>()
        .await
        .ok()
        .and_then(|body| body.message)
        .unwrap_or_else(|| format!("GitHub API returned HTTP {}", status.as_u16()));

    let code = if is_rate_limited(status.as_u16(), &headers, &message) {
        GitHubApiErrorCode::RateLimited
    } else {
        match status.as_u16() {
            401 => GitHubApiErrorCode::Unauthorized,
            403 => GitHubApiErrorCode::Forbidden,
            404 => GitHubApiErrorCode::NotFound,
            _ => GitHubApiErrorCode::Unknown,
        }
    };

    GitHubApiError::new(code, message, Some(status.as_u16()))
        .with_retry_after(parse_retry_after_seconds(&headers))
}

fn is_rate_limited(status: u16, headers: &HeaderMap, message: &str) -> bool {
    status == 429
        || headers
            .get("x-ratelimit-remaining")
            .and_then(|value| value.to_str().ok())
            == Some("0")
        || message.to_lowercase().contains("rate limit")
}

fn parse_retry_after_seconds(headers: &HeaderMap) -> Option<u64> {
    headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
}

fn repository_file_from_content_response(
    response: GitHubContentResponse,
) -> Result<RepositoryFileContent, GitHubApiError> {
    if response.kind != "file" {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::Directory,
        ));
    }

    if response.size > MAX_TEXT_FILE_BYTES {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::TooLarge,
        ));
    }

    if response.encoding.as_deref() != Some("base64") {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::UnsupportedEncoding,
        ));
    }

    let encoded = response.content.ok_or_else(|| {
        GitHubApiError::new(
            GitHubApiErrorCode::InvalidResponse,
            "GitHub file content response did not include file content",
            None,
        )
    })?;
    let normalized = encoded
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    let bytes = BASE64_STANDARD.decode(normalized).map_err(|error| {
        GitHubApiError::new(GitHubApiErrorCode::InvalidResponse, error.to_string(), None)
    })?;

    if bytes.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            bytes.len() as u64,
            RepositoryFileSkipReason::TooLarge,
        ));
    }

    if bytes.contains(&0) {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::Binary,
        ));
    }

    let Ok(text) = std::str::from_utf8(&bytes) else {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::Binary,
        ));
    };

    if is_git_lfs_pointer(text) {
        return Ok(skipped_repository_file(
            response.path,
            response.sha,
            response.size,
            RepositoryFileSkipReason::GitLfsPointer,
        ));
    }

    Ok(RepositoryFileContent {
        path: response.path,
        sha: response.sha,
        size: response.size,
        content: Some(text.to_owned()),
        skipped_reason: None,
    })
}

fn skipped_repository_file(
    path: String,
    sha: String,
    size: u64,
    skipped_reason: RepositoryFileSkipReason,
) -> RepositoryFileContent {
    RepositoryFileContent {
        path,
        sha,
        size,
        content: None,
        skipped_reason: Some(skipped_reason),
    }
}

fn is_git_lfs_pointer(text: &str) -> bool {
    text.starts_with("version https://git-lfs.github.com/spec/v1\n")
        && text.contains("\noid sha256:")
        && text.contains("\nsize ")
}

#[derive(Debug, Deserialize)]
struct GitHubErrorResponse {
    message: Option<String>,
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

#[derive(Debug, Deserialize)]
struct GitHubContentResponse {
    path: String,
    sha: String,
    size: u64,
    #[serde(rename = "type")]
    kind: String,
    encoding: Option<String>,
    content: Option<String>,
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
    use crate::models::{FileChange, GitHubApiErrorCode, RepositoryFileSkipReason};
    use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
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
    async fn loads_text_file_content_from_github_api() {
        let body = file_content_body("README.md", "sha-readme", "Hello, DevChat!");
        let addr = spawn_github_server(&body, |request| {
            assert!(request
                .starts_with("GET /repos/colna/ccraft/contents/README.md?ref=feature%2Fmobile "));
        })
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let file = client
            .get_file_content("colna", "ccraft", "feature/mobile", "README.md")
            .await
            .unwrap();

        assert_eq!(file.content.as_deref(), Some("Hello, DevChat!"));
        assert_eq!(file.skipped_reason, None);
    }

    #[tokio::test]
    async fn maps_missing_file_content_to_structured_not_found_error() {
        let addr = spawn_github_server_with_response(
            404,
            "",
            r#"{ "message": "Not Found" }"#,
            |request| {
                assert!(
                    request.starts_with("GET /repos/colna/ccraft/contents/missing.ts?ref=main ")
                );
            },
        )
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let error = client
            .get_file_content("colna", "ccraft", "main", "missing.ts")
            .await
            .unwrap_err();

        assert_eq!(error.code, GitHubApiErrorCode::NotFound);
        assert_eq!(error.status, Some(404));
    }

    #[tokio::test]
    async fn rejects_unsafe_repository_file_paths_before_requesting_github() {
        let client = GitHubClient::with_base_url("ghp_test", "http://127.0.0.1:1");
        let error = client
            .get_file_content("colna", "ccraft", "main", "../secret.txt")
            .await
            .unwrap_err();

        assert_eq!(error.code, GitHubApiErrorCode::InvalidInput);
    }

    #[tokio::test]
    async fn maps_rate_limits_to_structured_errors() {
        let addr = spawn_github_server_with_response(
            403,
            "x-ratelimit-remaining: 0\r\nretry-after: 30\r\n",
            r#"{ "message": "API rate limit exceeded" }"#,
            |_| {},
        )
        .await;

        let client = GitHubClient::with_base_url("ghp_test", &format!("http://{addr}"));
        let error = client
            .get_file_content("colna", "ccraft", "main", "src/App.tsx")
            .await
            .unwrap_err();

        assert_eq!(error.code, GitHubApiErrorCode::RateLimited);
        assert_eq!(error.retry_after_seconds, Some(30));
    }

    #[tokio::test]
    async fn skips_large_binary_and_lfs_file_content() {
        let large = client_file_from_body(
            r#"{
            "path": "large.log",
            "sha": "sha-large",
            "size": 524289,
            "type": "file",
            "encoding": "base64",
            "content": ""
        }"#,
        );
        assert_eq!(
            large.skipped_reason,
            Some(RepositoryFileSkipReason::TooLarge)
        );

        let binary = client_file_from_body(&format!(
            r#"{{
                "path": "asset.bin",
                "sha": "sha-binary",
                "size": 2,
                "type": "file",
                "encoding": "base64",
                "content": "{}"
            }}"#,
            BASE64_STANDARD.encode([0, 1])
        ));
        assert_eq!(
            binary.skipped_reason,
            Some(RepositoryFileSkipReason::Binary)
        );

        let lfs_pointer = "version https://git-lfs.github.com/spec/v1\n\
oid sha256:4cac19622fc3ada9c0fdeadb33f88f367b541f38b89102a3f1261ac81fd5bcb5\n\
size 84977953\n";
        let lfs = client_file_from_body(&file_content_body("model.bin", "sha-lfs", lfs_pointer));
        assert_eq!(
            lfs.skipped_reason,
            Some(RepositoryFileSkipReason::GitLfsPointer)
        );
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

    fn client_file_from_body(body: &str) -> crate::models::RepositoryFileContent {
        let content = serde_json::from_str(body).unwrap();
        super::repository_file_from_content_response(content).unwrap()
    }

    fn file_content_body(path: &str, sha: &str, text: &str) -> String {
        format!(
            r#"{{
                "path": "{path}",
                "sha": "{sha}",
                "size": {},
                "type": "file",
                "encoding": "base64",
                "content": "{}"
            }}"#,
            text.len(),
            BASE64_STANDARD.encode(text.as_bytes())
        )
    }

    async fn spawn_github_server<F>(body: &str, assert_request: F) -> SocketAddr
    where
        F: FnOnce(&str) + Send + 'static,
    {
        spawn_github_server_with_response(200, "", body, assert_request).await
    }

    async fn spawn_github_server_with_response<F>(
        status: u16,
        extra_headers: &str,
        body: &str,
        assert_request: F,
    ) -> SocketAddr
    where
        F: FnOnce(&str) + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let body = body.to_owned();
        let extra_headers = extra_headers.to_owned();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 4096];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert_request(&request);

            let reason = match status {
                200 => "OK",
                403 => "Forbidden",
                404 => "Not Found",
                429 => "Too Many Requests",
                _ => "Error",
            };
            let response = format!(
                "HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\n{extra_headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        addr
    }
}
