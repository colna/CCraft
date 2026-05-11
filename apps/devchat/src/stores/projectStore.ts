import type { Branch, Project, ProjectSnapshot, Repository } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand, listenCommandEvent } from "../lib/tauri";

export const GITHUB_TOKEN_SECRET_REF = "github.default.token";
const REPOS_PER_PAGE = 50;

interface SnapshotProgress {
  requestId: string;
  phase: string;
  percent: number;
  message: string;
}

interface ProjectState {
  repos: Repository[];
  branches: Branch[];
  recentProjects: Project[];
  currentProject: Project | null;
  snapshotProgress: SnapshotProgress | undefined;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | undefined;
  loadRepos: (options?: { reset?: boolean }) => Promise<void>;
  loadMoreRepos: () => Promise<void>;
  loadRecentProjects: () => Promise<void>;
  loadBranches: () => Promise<void>;
  setProjectBranch: (branchName: string) => void;
  refreshCurrentBranch: () => Promise<boolean>;
  refreshSnapshot: (options?: { refresh?: boolean }) => Promise<Project | null>;
  selectProject: (repo: Repository) => Promise<Project>;
  openRecentProject: (project: Project) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  repos: [],
  branches: [],
  recentProjects: [],
  currentProject: null,
  snapshotProgress: undefined,
  page: 0,
  hasMore: true,
  isLoading: false,
  error: undefined,
  loadRepos: async (options) => {
    const reset = options?.reset ?? true;
    const nextPage = reset ? 1 : get().page + 1;
    set({ isLoading: true, error: undefined });
    try {
      const repos = await invokeCommand<Repository[]>("github_list_repos", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        page: nextPage,
        perPage: REPOS_PER_PAGE
      });
      set((state) => ({
        repos: reset ? repos : mergeRepos(state.repos, repos),
        page: nextPage,
        hasMore: repos.length === REPOS_PER_PAGE,
        isLoading: false
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "仓库加载失败，请先保存 GitHub Token"
      });
    }
  },
  loadMoreRepos: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;
    await state.loadRepos({ reset: false });
  },
  loadRecentProjects: async () => {
    try {
      const recentProjects = await invokeCommand<Project[]>("load_recent_projects");
      set({ recentProjects });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "最近项目加载失败"
      });
    }
  },
  loadBranches: async () => {
    const project = get().currentProject;
    if (!project) return;

    try {
      const branches = await invokeCommand<Branch[]>("github_list_branches", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: project.repoOwner,
        repo: project.repoName
      });
      const activeProject = get().currentProject;
      if (!activeProject || activeProject.repoOwner !== project.repoOwner || activeProject.repoName !== project.repoName) {
        return;
      }
      const currentBranch = branches.find((branch) => branch.name === project.branch);
      set({
        branches,
        currentProject: currentBranch ? { ...activeProject, branchSha: currentBranch.sha } : activeProject,
        error: undefined
      });
    } catch (error) {
      set({ branches: [], error: error instanceof Error ? error.message : "分支加载失败" });
    }
  },
  setProjectBranch: (branchName) => {
    const state = get();
    const project = state.currentProject;
    if (!project) return;

    const branch = state.branches.find((branch) => branch.name === branchName);
    const nextProject: Project = { ...project, branch: branchName };
    if (branch) {
      nextProject.branchSha = branch.sha;
    } else {
      delete nextProject.branchSha;
    }

    set({
      currentProject: nextProject
    });
  },
  refreshCurrentBranch: async () => {
    const project = get().currentProject;
    if (!project) return false;

    try {
      const branch = await invokeCommand<Branch>("github_get_branch", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: project.repoOwner,
        repo: project.repoName,
        branch: project.branch
      });
      const activeProject = get().currentProject;
      if (!activeProject || activeProject.repoOwner !== project.repoOwner || activeProject.repoName !== project.repoName || activeProject.branch !== project.branch) {
        return false;
      }

      if (project.branchSha && project.branchSha !== branch.sha) {
        set({
          error: "远程分支已更新，请刷新项目上下文后再提交"
        });
        return false;
      }

      set({ currentProject: { ...activeProject, branchSha: branch.sha }, error: undefined });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "分支刷新失败" });
      return false;
    }
  },
  selectProject: async (repo) => {
    set({ isLoading: true, error: undefined, branches: [], snapshotProgress: undefined });
    const requestId = createRequestId();
    const unlisten = await subscribeSnapshotProgress(requestId, set);
    try {
      const snapshot = await invokeCommand<ProjectSnapshot>("generate_snapshot", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: repo.owner,
        repo: repo.name,
        branch: repo.defaultBranch,
        refresh: false,
        requestId
      });
      const project: Project = {
        repoId: repo.id,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoFullName: repo.fullName,
        branch: repo.defaultBranch,
        snapshot,
        lastAccessed: new Date().toISOString()
      };
      const recentProjects = await invokeCommand<Project[]>("save_recent_project", { project });
      set({ currentProject: project, recentProjects, branches: [], snapshotProgress: undefined, isLoading: false });
      return project;
    } catch (error) {
      set({
        isLoading: false,
        snapshotProgress: undefined,
        error: error instanceof Error ? error.message : "项目快照生成失败"
      });
      throw error;
    } finally {
      unlisten();
    }
  },
  refreshSnapshot: async (options) => {
    const project = get().currentProject;
    if (!project) return null;

    set({ isLoading: true, error: undefined, snapshotProgress: undefined });
    const requestId = createRequestId();
    const unlisten = await subscribeSnapshotProgress(requestId, set);
    try {
      const snapshot = await invokeCommand<ProjectSnapshot>("generate_snapshot", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: project.repoOwner,
        repo: project.repoName,
        branch: project.branch,
        cacheRef: project.branchSha ?? project.branch,
        refresh: options?.refresh ?? false,
        requestId
      });
      const updatedProject: Project = {
        ...project,
        snapshot,
        lastAccessed: new Date().toISOString()
      };
      const recentProjects = await invokeCommand<Project[]>("save_recent_project", { project: updatedProject });
      set({ currentProject: updatedProject, recentProjects, isLoading: false, snapshotProgress: undefined });
      return updatedProject;
    } catch (error) {
      set({
        isLoading: false,
        snapshotProgress: undefined,
        error: error instanceof Error ? error.message : "项目快照刷新失败"
      });
      return null;
    } finally {
      unlisten();
    }
  },
  openRecentProject: async (project) => {
    const updatedProject = { ...project, lastAccessed: new Date().toISOString() };
    try {
      const recentProjects = await invokeCommand<Project[]>("save_recent_project", { project: updatedProject });
      set({ currentProject: updatedProject, recentProjects, branches: [], error: undefined });
    } catch {
      set({ currentProject: updatedProject, branches: [], error: undefined });
    }
    if (!updatedProject.snapshot) {
      return await get().refreshSnapshot({ refresh: false }) ?? updatedProject;
    }
    return updatedProject;
  }
}));

function mergeRepos(existing: Repository[], incoming: Repository[]): Repository[] {
  const repos = new Map(existing.map((repo) => [repo.id, repo]));
  for (const repo of incoming) {
    repos.set(repo.id, repo);
  }
  return Array.from(repos.values());
}

async function subscribeSnapshotProgress(
  requestId: string,
  set: (partial: Partial<ProjectState>) => void
) {
  return listenCommandEvent<SnapshotProgress>("snapshot-progress", (event) => {
    if (event.requestId === requestId) {
      set({ snapshotProgress: event });
    }
  });
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}`;
}
