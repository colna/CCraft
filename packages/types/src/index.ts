export type Role = "user" | "assistant" | "system";
export type AiProvider = "claude";

export interface AiConfig {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKeySecretRef: string;
  isActive: boolean;
  maskedKey?: string;
}

export interface UserPreferences {
  theme: "system" | "light" | "dark";
  language: "zh-CN" | "en-US";
  defaultBranch: string;
}

export interface User {
  aiConfigs: AiConfig[];
  githubLinked: boolean;
  preferences: UserPreferences;
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

export interface KeyFile {
  path: string;
  role: string;
  summary: string;
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
  generatedAt: string;
}

export interface Project {
  repoId: string;
  repoName: string;
  branch: string;
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
  type: "added" | "modified" | "deleted";
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  rawDiff: string;
  selected: boolean;
}

export interface Session {
  id: string;
  projectId: string;
  messages: Message[];
  pendingChanges: FileDiff[];
  status: "active" | "committed";
  createdAt: string;
}

export interface CommitResult {
  sha: string;
  htmlUrl?: string;
}
