import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff, Project } from "@devchat/types";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
import { CommitPage } from ".";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand
}));

const project: Project = {
  repoId: "repo-1",
  repoOwner: "octo",
  repoName: "devchat",
  repoFullName: "octo/devchat",
  branch: "main",
  branchSha: "abc123",
  lastAccessed: "2026-05-11T00:00:00.000Z"
};

const diff: FileDiff = {
  filePath: "src/App.tsx",
  type: "modified",
  hunks: [
    {
      header: "@@ -1 +1 @@",
      lines: ["-old", "+new"]
    }
  ],
  additions: 1,
  deletions: 1,
  rawDiff: `--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old
+new`,
  selected: true
};

describe("CommitPage", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockImplementation(async (command: string) => {
      if (command === "github_list_branches") {
        return [{ name: "main", sha: "abc123", protected: false }];
      }
      if (command === "github_get_branch") {
        return { name: "main", sha: "abc123", protected: false };
      }
      if (command === "github_get_file_content") {
        return { path: "src/App.tsx", sha: "file-sha", size: 4, content: "old\n" };
      }
      if (command === "github_commit_and_push") {
        return { sha: "commit-sha" };
      }
      throw new Error(`unexpected command ${command}`);
    });
    useProjectStore.setState({
      currentProject: project,
      branches: [],
      isLoading: false,
      error: undefined
    });
    useChatStore.setState({
      messages: [],
      isGenerating: false,
      pendingDiffs: [diff],
      error: undefined,
      lastFailedUserMessageId: undefined
    });
  });

  it("builds final file content before calling commit and push", async () => {
    render(
      <MemoryRouter>
        <CommitPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/i }));

    await waitFor(() => {
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith(
        "github_commit_and_push",
        expect.objectContaining({
          changes: [
            {
              path: "src/App.tsx",
              content: "new\n",
              changeType: "modified"
            }
          ]
        })
      );
    });
  });
});
