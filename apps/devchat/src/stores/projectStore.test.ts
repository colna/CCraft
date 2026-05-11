import type { Branch, ProjectSnapshot, Repository } from "@devchat/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_TOKEN_SECRET_REF, useProjectStore } from "./projectStore";
import { invokeCommand } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  invokeCommand: vi.fn()
}));

const repo: Repository = {
  id: "42",
  owner: "colna",
  name: "ccraft",
  fullName: "colna/ccraft",
  private: true,
  language: "TypeScript",
  stars: 9,
  defaultBranch: "main",
  updatedAt: "2026-05-11T00:00:00Z"
};

const snapshot: ProjectSnapshot = {
  directoryTree: { src: { "App.tsx": "file" } },
  techStack: { language: "TypeScript", framework: "Tauri + React", dependencies: ["react", "tauri"] },
  keyFiles: [{ path: "src/App.tsx", role: "root component", summary: "前端根组件" }],
  moduleMap: { src: ["src/App.tsx"] },
  skippedFiles: [],
  generatedAt: "unix:1778457600"
};

const branch: Branch = {
  name: "main",
  sha: "abc123",
  protected: true
};

describe("projectStore", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockReset();
    useProjectStore.setState({
      repos: [],
      branches: [],
      recentProjects: [],
      currentProject: null,
      page: 0,
      hasMore: true,
      isLoading: false,
      error: undefined
    });
  });

  it("loads repositories through the GitHub token secret ref", async () => {
    vi.mocked(invokeCommand).mockResolvedValueOnce([repo]);

    await useProjectStore.getState().loadRepos();

    expect(invokeCommand).toHaveBeenCalledWith("github_list_repos", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      page: 1,
      perPage: 50
    });
    expect(useProjectStore.getState().repos).toEqual([repo]);
    expect(useProjectStore.getState().page).toBe(1);
    expect(useProjectStore.getState().hasMore).toBe(false);
  });

  it("loads more repositories by appending the next page", async () => {
    const secondRepo: Repository = { ...repo, id: "43", name: "web", fullName: "colna/web" };
    vi.mocked(invokeCommand).mockResolvedValueOnce([repo]).mockResolvedValueOnce([secondRepo]);

    await useProjectStore.getState().loadRepos();
    useProjectStore.setState({ hasMore: true });
    await useProjectStore.getState().loadMoreRepos();

    expect(invokeCommand).toHaveBeenNthCalledWith(2, "github_list_repos", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      page: 2,
      perPage: 50
    });
    expect(useProjectStore.getState().repos.map((repo) => repo.id)).toEqual(["42", "43"]);
  });

  it("generates a project snapshot from the selected repository", async () => {
    vi.mocked(invokeCommand).mockResolvedValueOnce(snapshot).mockResolvedValueOnce([]);

    const project = await useProjectStore.getState().selectProject(repo);

    expect(invokeCommand).toHaveBeenCalledWith("generate_snapshot", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      owner: "colna",
      repo: "ccraft",
      branch: "main"
    });
    expect(invokeCommand).toHaveBeenCalledWith("save_recent_project", {
      project: expect.objectContaining({ repoId: "42", repoFullName: "colna/ccraft" })
    });
    expect(project.snapshot).toEqual(snapshot);
    expect(useProjectStore.getState().currentProject?.repoName).toBe("ccraft");
  });

  it("loads and reopens recent projects", async () => {
    const project = {
      repoId: "42",
      repoOwner: "colna",
      repoName: "ccraft",
      repoFullName: "colna/ccraft",
      branch: "main",
      branchSha: "abc123",
      snapshot,
      lastAccessed: "2026-05-11T00:00:00Z"
    };
    vi.mocked(invokeCommand).mockResolvedValueOnce([project]).mockResolvedValueOnce([project]);

    await useProjectStore.getState().loadRecentProjects();
    const reopened = await useProjectStore.getState().openRecentProject(project);

    expect(invokeCommand).toHaveBeenNthCalledWith(1, "load_recent_projects");
    expect(invokeCommand).toHaveBeenNthCalledWith(2, "save_recent_project", {
      project: expect.objectContaining({ repoId: "42" })
    });
    expect(reopened.repoName).toBe("ccraft");
    expect(useProjectStore.getState().currentProject?.repoId).toBe("42");
  });

  it("loads branches and switches the current project branch", async () => {
    const project = {
      repoId: "42",
      repoOwner: "colna",
      repoName: "ccraft",
      repoFullName: "colna/ccraft",
      branch: "main",
      snapshot,
      lastAccessed: "2026-05-11T00:00:00Z"
    };
    useProjectStore.setState({ currentProject: project });
    vi.mocked(invokeCommand).mockResolvedValueOnce([branch, { ...branch, name: "feature/mobile", sha: "def456" }]);

    await useProjectStore.getState().loadBranches();
    useProjectStore.getState().setProjectBranch("feature/mobile");

    expect(invokeCommand).toHaveBeenCalledWith("github_list_branches", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      owner: "colna",
      repo: "ccraft"
    });
    expect(useProjectStore.getState().currentProject?.branch).toBe("feature/mobile");
    expect(useProjectStore.getState().currentProject?.branchSha).toBe("def456");
  });

  it("blocks commit when the remote branch sha changed after loading", async () => {
    const project = {
      repoId: "42",
      repoOwner: "colna",
      repoName: "ccraft",
      repoFullName: "colna/ccraft",
      branch: "main",
      branchSha: "old-sha",
      snapshot,
      lastAccessed: "2026-05-11T00:00:00Z"
    };
    useProjectStore.setState({ currentProject: project });
    vi.mocked(invokeCommand).mockResolvedValueOnce({ ...branch, sha: "new-sha" });

    const isFresh = await useProjectStore.getState().refreshCurrentBranch();

    expect(invokeCommand).toHaveBeenCalledWith("github_get_branch", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      owner: "colna",
      repo: "ccraft",
      branch: "main"
    });
    expect(isFresh).toBe(false);
    expect(useProjectStore.getState().error).toContain("远程分支已更新");
    expect(useProjectStore.getState().currentProject?.branchSha).toBe("old-sha");
  });
});
