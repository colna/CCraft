import type { ProjectSnapshot } from "@devchat/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BranchSelector } from "./BranchSelector";
import { GITHUB_TOKEN_SECRET_REF, useProjectStore } from "../stores/projectStore";
import { invokeCommand } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  invokeCommand: vi.fn()
}));

const snapshot: ProjectSnapshot = {
  directoryTree: {},
  techStack: {
    language: "TypeScript",
    framework: "React",
    dependencies: ["react"]
  },
  keyFiles: [],
  moduleMap: {},
  generatedAt: "unix:1778457600"
};

describe("BranchSelector", () => {
  beforeEach(() => {
    vi.mocked(invokeCommand).mockReset();
    useProjectStore.setState({
      repos: [],
      branches: [],
      recentProjects: [],
      currentProject: {
        repoId: "42",
        repoOwner: "colna",
        repoName: "ccraft",
        repoFullName: "colna/ccraft",
        branch: "main",
        snapshot,
        lastAccessed: "2026-05-11T00:00:00Z"
      },
      page: 0,
      hasMore: true,
      isLoading: false,
      error: undefined
    });
  });

  it("loads real branches and updates the selected target branch", async () => {
    vi.mocked(invokeCommand).mockResolvedValueOnce([
      { name: "main", sha: "abc123", protected: true },
      { name: "feature/mobile", sha: "def456", protected: false }
    ]);

    render(<BranchSelector />);

    await waitFor(() => {
      expect(invokeCommand).toHaveBeenCalledWith("github_list_branches", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: "colna",
        repo: "ccraft"
      });
    });

    fireEvent.change(screen.getByLabelText("目标分支"), { target: { value: "feature/mobile" } });

    expect(useProjectStore.getState().currentProject?.branch).toBe("feature/mobile");
    expect(useProjectStore.getState().currentProject?.branchSha).toBe("def456");
  });
});
