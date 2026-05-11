import type { ProjectSnapshot, Repository } from "@devchat/types";
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
  generatedAt: "unix:1778457600"
};

describe("projectStore", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockReset();
    useProjectStore.setState({
      repos: [],
      currentProject: null,
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
  });

  it("generates a project snapshot from the selected repository", async () => {
    vi.mocked(invokeCommand).mockResolvedValueOnce(snapshot);

    const project = await useProjectStore.getState().selectProject(repo);

    expect(invokeCommand).toHaveBeenCalledWith("generate_snapshot", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      owner: "colna",
      repo: "ccraft",
      branch: "main"
    });
    expect(project.snapshot).toEqual(snapshot);
    expect(useProjectStore.getState().currentProject?.repoName).toBe("ccraft");
  });
});
