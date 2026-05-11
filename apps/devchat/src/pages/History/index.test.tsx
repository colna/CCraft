import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@devchat/types";
import { useChatStore } from "../../stores/chatStore";
import { HistoryPage } from ".";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand
}));

describe("HistoryPage", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "load_chat_sessions") {
        return [activeSession(), committedSession()];
      }
      if (command === "delete_chat_session") {
        expect(args?.id).toBe("session-active");
        return [committedSession()];
      }
      throw new Error(`unexpected command ${command}`);
    });
    useChatStore.setState({
      sessions: [],
      currentSessionId: undefined,
      currentSessionStatus: undefined,
      messages: [],
      pendingDiffs: [],
      error: undefined,
      lastFailedUserMessageId: undefined,
      isGenerating: false
    });
  });

  it("loads sessions grouped by project and opens a session", async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("octo/devchat")).toBeTruthy();
    expect(screen.getByText("修复登录错误")).toBeTruthy();
    expect(screen.getByText("已提交的重构")).toBeTruthy();

    fireEvent.click(screen.getByText("修复登录错误"));

    expect(useChatStore.getState().currentSessionId).toBe("session-active");
    expect(useChatStore.getState().messages[0]?.content).toBe("修复登录错误");
  });

  it("deletes persisted sessions", async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    );

    await screen.findByText("修复登录错误");
    fireEvent.click(screen.getByLabelText("删除会话 修复登录错误"));

    await waitFor(() => {
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith("delete_chat_session", { id: "session-active" });
    });
    expect(useChatStore.getState().sessions).toHaveLength(1);
  });
});

function activeSession(): Session {
  return {
    id: "session-active",
    projectId: "octo/devchat#main",
    repoFullName: "octo/devchat",
    branch: "main",
    title: "修复登录错误",
    messages: [{
      id: "message-1",
      role: "user",
      content: "修复登录错误",
      createdAt: "2026-05-11T00:00:00.000Z"
    }],
    pendingChanges: [],
    status: "active",
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T01:00:00.000Z"
  };
}

function committedSession(): Session {
  return {
    ...activeSession(),
    id: "session-committed",
    title: "已提交的重构",
    status: "committed",
    commitSha: "abc123",
    pendingChanges: [],
    updatedAt: "2026-05-11T02:00:00.000Z"
  };
}
