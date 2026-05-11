import type { Project, ProjectSnapshot, Repository } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand } from "../lib/tauri";

export const GITHUB_TOKEN_SECRET_REF = "github.default.token";
const REPOS_PER_PAGE = 50;

interface ProjectState {
  repos: Repository[];
  recentProjects: Project[];
  currentProject: Project | null;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | undefined;
  loadRepos: (options?: { reset?: boolean }) => Promise<void>;
  loadMoreRepos: () => Promise<void>;
  loadRecentProjects: () => Promise<void>;
  selectProject: (repo: Repository) => Promise<Project>;
  openRecentProject: (project: Project) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  repos: [],
  recentProjects: [],
  currentProject: null,
  page: 0,
  hasMore: true,
  isLoading: false,
  error: undefined,
  loadRepos: async (options) => {
    const reset = options?.reset ?? true;
    const nextPage = reset ? 1 : useProjectStore.getState().page + 1;
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
    const state = useProjectStore.getState();
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
  selectProject: async (repo) => {
    set({ isLoading: true, error: undefined });
    try {
      const snapshot = await invokeCommand<ProjectSnapshot>("generate_snapshot", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: repo.owner,
        repo: repo.name,
        branch: repo.defaultBranch
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
      set({ currentProject: project, recentProjects, isLoading: false });
      return project;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "项目快照生成失败"
      });
      throw error;
    }
  },
  openRecentProject: async (project) => {
    const updatedProject = { ...project, lastAccessed: new Date().toISOString() };
    try {
      const recentProjects = await invokeCommand<Project[]>("save_recent_project", { project: updatedProject });
      set({ currentProject: updatedProject, recentProjects, error: undefined });
    } catch {
      set({ currentProject: updatedProject, error: undefined });
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
