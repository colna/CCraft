import type { Project, ProjectSnapshot, Repository } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand } from "../lib/tauri";

export const GITHUB_TOKEN_SECRET_REF = "github.default.token";

interface ProjectState {
  repos: Repository[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | undefined;
  loadRepos: () => Promise<void>;
  selectProject: (repo: Repository) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  repos: [],
  currentProject: null,
  isLoading: false,
  error: undefined,
  loadRepos: async () => {
    set({ isLoading: true, error: undefined });
    try {
      const repos = await invokeCommand<Repository[]>("github_list_repos", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        page: 1,
        perPage: 50
      });
      set({ repos, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "仓库加载失败，请先保存 GitHub Token"
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
      set({ currentProject: project, isLoading: false });
      return project;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "项目快照生成失败"
      });
      throw error;
    }
  }
}));
