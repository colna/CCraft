import type { Project, ProjectSnapshot, Repository } from "@devchat/types";
import { create } from "zustand";
import { demoProject, demoRepos } from "../lib/mockData";
import { invokeCommand } from "../lib/tauri";

interface ProjectState {
  repos: Repository[];
  currentProject: Project | null;
  isLoading: boolean;
  loadRepos: () => Promise<void>;
  selectProject: (repo: Repository) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  repos: demoRepos,
  currentProject: demoProject,
  isLoading: false,
  loadRepos: async () => {
    set({ isLoading: true });
    const repos = await invokeCommand<Repository[]>("github_list_repos");
    set({ repos, isLoading: false });
  },
  selectProject: async (repo) => {
    set({ isLoading: true });
    const snapshot = await invokeCommand<ProjectSnapshot>("generate_snapshot", {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.defaultBranch
    });
    const project: Project = {
      repoId: repo.id,
      repoName: repo.name,
      branch: repo.defaultBranch,
      snapshot,
      lastAccessed: new Date().toISOString()
    };
    set({ currentProject: project, isLoading: false });
    return project;
  }
}));
