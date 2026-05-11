export type Role = "user" | "assistant" | "system";
export type AiProvider = "claude" | "openai-compatible";

export interface AiConfig {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKeySecretRef: string;
  isActive: boolean;
}

export type GitHubAuthStatus = "not_configured" | "configured" | "invalid" | "expired";

export interface UserPreferences {
  theme: "system" | "light" | "dark";
  language: "zh-CN" | "en-US";
  defaultBranch: string;
}

export interface User {
  aiConfigs: AiConfig[];
  githubAuthStatus: GitHubAuthStatus;
  preferences: UserPreferences;
}

export interface UserConfig extends User {
  version: 1;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  language: string | null;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export type RepositoryFileSkipReason =
  | "too_large"
  | "binary"
  | "git_lfs_pointer"
  | "unsupported_encoding"
  | "directory";

export interface RepositoryFileContent {
  path: string;
  sha: string;
  size: number;
  content?: string;
  skippedReason?: RepositoryFileSkipReason;
}

export type GitHubApiErrorCode =
  | "invalid_input"
  | "not_found"
  | "rate_limited"
  | "unauthorized"
  | "forbidden"
  | "invalid_response"
  | "network"
  | "unknown";

export interface GitHubApiError {
  code: GitHubApiErrorCode;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface KeyFile {
  path: string;
  role: string;
  summary: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ProjectSnapshot {
  directoryTree: Record<string, unknown>;
  techStack: {
    language: string;
    framework: string;
    dependencies: string[];
  };
  keyFiles: KeyFile[];
  moduleMap: Record<string, string[]>;
  skippedFiles: SkippedFile[];
  generatedAt: string;
}

export interface Project {
  repoId: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  branch: string;
  branchSha?: string;
  snapshot?: ProjectSnapshot;
  lastAccessed: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface DiffHunk {
  header: string;
  lines: string[];
}

export interface FileDiff {
  filePath: string;
  previousFilePath?: string;
  type: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  rawDiff: string;
  selected: boolean;
}

export interface Session {
  id: string;
  projectId: string;
  repoFullName: string;
  branch: string;
  title: string;
  messages: Message[];
  pendingChanges: FileDiff[];
  status: "active" | "committed";
  commitSha?: string;
  commitUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionHistory {
  version: 1;
  sessions: Session[];
}

export interface CommitResult {
  sha: string;
  htmlUrl?: string;
}
