import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSnapshot } from "@devchat/types";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
import { ChatPage } from ".";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  listenCommandEvent: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand,
  listenCommandEvent: tauriMock.listenCommandEvent
}));

const snapshot: ProjectSnapshot = {
  directoryTree: { src: { "App.tsx": "file" } },
  techStack: { language: "TypeScript", framework: "React", dependencies: ["vite"] },
  keyFiles: [{ path: "src/App.tsx", role: "entry", summary: "React entry" }],
  moduleMap: { app: ["src/App.tsx"] },
  skippedFiles: [],
  generatedAt: "2026-05-11T00:00:00.000Z"
};

describe("ChatPage", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockResolvedValue([]);
    tauriMock.listenCommandEvent.mockResolvedValue(() => {});
    useChatStore.setState({
      messages: [],
      isGenerating: false,
      pendingDiffs: [],
      error: undefined,
      lastFailedUserMessageId: undefined
    });
    useAIConfigStore.setState({
      activeConfig: {
        id: "openai",
        name: "OpenAI-compatible",
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com",
        model: "gpt-4.1-mini",
        apiKeySecretRef: "ai.openai.apiKey",
        isActive: true
      }
    });
    useProjectStore.setState({
      currentProject: {
        repoId: "repo-1",
        repoOwner: "octo",
        repoName: "devchat",
        repoFullName: "octo/devchat",
        branch: "feature/real-ai",
        branchSha: "abc123",
        snapshot,
        lastAccessed: "2026-05-11T00:00:00.000Z"
      },
      branches: [],
      snapshotProgress: undefined,
      isLoading: false,
      error: undefined
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the active project, branch and model context", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getAllByText("octo/devchat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("feature/real-ai").length).toBeGreaterThan(0);
    expect(screen.getByText("OpenAI-compatible · gpt-4.1-mini")).toBeTruthy();
    expect(screen.getByText("快照已就绪")).toBeTruthy();
  });
});
