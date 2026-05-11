import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Session } from "@devchat/types";
import { defaultConfig, useAIConfigStore } from "./aiConfigStore";
import { useChatStore } from "./chatStore";
import { useProjectStore } from "./projectStore";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  listeners: new Map<string, (payload: unknown) => void>()
}));

vi.mock("../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand,
  listenCommandEvent: async (eventName: string, handler: (payload: unknown) => void) => {
    tauriMock.listeners.set(eventName, handler);
    return () => {
      tauriMock.listeners.delete(eventName);
    };
  }
}));

describe("chatStore", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockReset();
    tauriMock.listeners.clear();
    useChatStore.setState({
      messages: [],
      isGenerating: false,
      pendingDiffs: [],
      sessions: [],
      currentSessionId: undefined,
      currentSessionStatus: undefined,
      error: undefined,
      lastFailedUserMessageId: undefined
    });
    useProjectStore.setState({
      currentProject: null,
      recentProjects: [],
      repos: [],
      branches: [],
      snapshotProgress: undefined,
      page: 0,
      hasMore: true,
      isLoading: false,
      error: undefined
    });
    useAIConfigStore.setState({
      configs: [defaultConfig],
      activeConfig: defaultConfig,
      githubAuthStatus: "not_configured",
      preferences: {
        theme: "system",
        language: "zh-CN",
        defaultBranch: "main"
      },
      isLoading: false,
      saveStatus: "idle",
      connectionStatus: "idle",
      error: undefined
    });
  });

  it("streams real assistant chunks from the Tauri command", async () => {
    tauriMock.invokeCommand.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      expect(command).toBe("chat_stream");
      expect(args.requestId).toEqual(expect.any(String));
      expect(args.provider).toBe("claude");
      expect(args.messages).toEqual([{ role: "user", content: "帮我修复登录错误" }]);
      expect(args.systemPrompt).toContain("DevChat");
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "真实" });
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "回复" });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.messages[1]).toMatchObject({ role: "assistant", content: "真实回复" });
    expect(state.pendingDiffs).toEqual([]);
    expect(state.isGenerating).toBe(false);
    expect(state.error).toBeUndefined();
  });

  it("passes the active OpenAI-compatible provider to the Tauri stream command", async () => {
    useAIConfigStore.setState({
      activeConfig: {
        id: "openai-compatible",
        name: "OpenAI-compatible",
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com",
        model: "gpt-4.1-mini",
        apiKeySecretRef: "ai.openai.apiKey",
        isActive: true
      }
    });
    tauriMock.invokeCommand.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      expect(command).toBe("chat_stream");
      expect(args.provider).toBe("openai-compatible");
      expect(args.baseUrl).toBe("https://api.openai.com");
      expect(args.model).toBe("gpt-4.1-mini");
      expect(args.apiKeySecretRef).toBe("ai.openai.apiKey");
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("帮我解释这个项目");

    expect(useChatStore.getState().error).toBeUndefined();
  });

  it("does not generate fallback replies when streaming fails", async () => {
    tauriMock.invokeCommand.mockRejectedValue(new Error("真实功能需要在 Tauri App 运行时中使用"));

    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.pendingDiffs).toEqual([]);
    expect(state.isGenerating).toBe(false);
    expect(state.error).toContain("Tauri App");
    expect(state.lastFailedUserMessageId).toBe(state.messages[0]?.id);
  });

  it("retries the last failed user message without duplicating it", async () => {
    let callCount = 0;
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("network down");
      }

      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "重试成功" });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("帮我修复登录错误");
    await useChatStore.getState().retryLastMessage();

    const state = useChatStore.getState();
    expect(tauriMock.invokeCommand).toHaveBeenCalledTimes(2);
    expect(state.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(state.messages[0]?.content).toBe("帮我修复登录错误");
    expect(state.messages[1]?.content).toBe("重试成功");
    expect(state.error).toBeUndefined();
    expect(state.lastFailedUserMessageId).toBeUndefined();
  });

  it("clears retryable errors", async () => {
    useChatStore.setState({
      error: "network down",
      lastFailedUserMessageId: "user-1"
    });

    useChatStore.getState().clearError();

    expect(useChatStore.getState().error).toBeUndefined();
    expect(useChatStore.getState().lastFailedUserMessageId).toBeUndefined();
  });

  it("removes an empty assistant message when the stream emits an error", async () => {
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      tauriMock.listeners.get("ai-stream-error")?.({ requestId: args.requestId, message: "Claude stream error" });
    });

    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.isGenerating).toBe(false);
    expect(state.error).toBe("Claude stream error");
  });

  it("ignores later chunks after generation is stopped", async () => {
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "停止前" });
      useChatStore.getState().stopGeneration();
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "停止后" });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ role: "assistant", content: "停止前" });
    expect(state.isGenerating).toBe(false);
    expect(state.error).toBeUndefined();
  });

  it("ignores chunks from a different stream request", async () => {
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: "old-stream", text: "旧回复" });
      tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "新回复" });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ role: "assistant", content: "新回复" });
    expect(state.error).toBeUndefined();
  });

  it("extracts pending diffs from a valid AI changeset", async () => {
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      tauriMock.listeners.get("ai-stream-chunk")?.({
        requestId: args.requestId,
        text: `DEVCHAT_CHANGESET
Summary: Update app.
Impact: Changes App copy.
Commit Message: feat: update app copy

\`\`\`diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old
+new
\`\`\``
      });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("更新 App 文案");

    const state = useChatStore.getState();
    expect(state.pendingDiffs).toHaveLength(1);
    expect(state.pendingDiffs[0]).toMatchObject({
      filePath: "src/App.tsx",
      additions: 1,
      deletions: 1
    });
    expect(state.error).toBeUndefined();
  });

  it("reports malformed AI diffs without creating pending changes", async () => {
    tauriMock.invokeCommand.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      tauriMock.listeners.get("ai-stream-chunk")?.({
        requestId: args.requestId,
        text: "DEVCHAT_CHANGESET\nSummary: bad\n\n```diff\nnot a diff\n```"
      });
      tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
    });

    await useChatStore.getState().sendMessage("生成坏 diff");

    const state = useChatStore.getState();
    expect(state.pendingDiffs).toEqual([]);
    expect(state.error).toContain("无法解析");
  });

  it("persists active sessions for the selected project", async () => {
    useProjectStore.setState({ currentProject: project() });
    tauriMock.invokeCommand.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === "chat_stream") {
        tauriMock.listeners.get("ai-stream-chunk")?.({ requestId: args.requestId, text: "完成" });
        tauriMock.listeners.get("ai-stream-done")?.({ requestId: args.requestId });
        return undefined;
      }
      if (command === "save_chat_session") {
        const session = args.session as Session;
        expect(session.projectId).toBe("colna/ccraft#main");
        expect(session.repoFullName).toBe("colna/ccraft");
        expect(session.status).toBe("active");
        expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
        return [session];
      }
      throw new Error(`unexpected command ${command}`);
    });

    await useChatStore.getState().sendMessage("修复登录错误");

    const state = useChatStore.getState();
    expect(state.currentSessionId).toEqual(expect.any(String));
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.title).toBe("修复登录错误");
  });

  it("opens and deletes persisted sessions", async () => {
    const storedSession = session();
    useChatStore.setState({ sessions: [storedSession] });

    useChatStore.getState().openSession(storedSession.id);

    expect(useChatStore.getState().messages).toEqual(storedSession.messages);
    expect(useChatStore.getState().pendingDiffs).toEqual(storedSession.pendingChanges);

    tauriMock.invokeCommand.mockResolvedValue([]);
    await useChatStore.getState().deleteSession(storedSession.id);

    const state = useChatStore.getState();
    expect(tauriMock.invokeCommand).toHaveBeenCalledWith("delete_chat_session", { id: storedSession.id });
    expect(state.sessions).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.pendingDiffs).toEqual([]);
  });

  it("marks the current session committed and clears pending diffs", async () => {
    const storedSession = session();
    useChatStore.setState({
      sessions: [storedSession],
      currentSessionId: storedSession.id,
      currentSessionStatus: "active",
      messages: storedSession.messages,
      pendingDiffs: storedSession.pendingChanges
    });
    const committed = { ...storedSession, status: "committed" as const, pendingChanges: [], commitSha: "abc123" };
    tauriMock.invokeCommand.mockResolvedValue([committed]);

    await useChatStore.getState().markCurrentSessionCommitted("abc123", "https://github.com/colna/ccraft/commit/abc123");

    const state = useChatStore.getState();
    expect(tauriMock.invokeCommand).toHaveBeenCalledWith("mark_chat_session_committed", {
      id: storedSession.id,
      commitSha: "abc123",
      commitUrl: "https://github.com/colna/ccraft/commit/abc123",
      updatedAt: expect.any(String)
    });
    expect(state.currentSessionStatus).toBe("committed");
    expect(state.pendingDiffs).toEqual([]);
    expect(state.sessions[0]?.commitSha).toBe("abc123");
  });

  it("keeps committed sessions read-only", async () => {
    const committed = { ...session(), status: "committed" as const, pendingChanges: [], commitSha: "abc123" };
    useChatStore.setState({
      sessions: [committed],
      currentSessionId: committed.id,
      currentSessionStatus: "committed",
      messages: committed.messages
    });

    await useChatStore.getState().sendMessage("继续修改");

    expect(tauriMock.invokeCommand).not.toHaveBeenCalled();
    expect(useChatStore.getState().error).toContain("只读");
  });
});

function project(): Project {
  return {
    repoId: "repo-1",
    repoOwner: "colna",
    repoName: "ccraft",
    repoFullName: "colna/ccraft",
    branch: "main",
    branchSha: "head-sha",
    lastAccessed: "2026-05-11T00:00:00.000Z"
  };
}

function session(): Session {
  return {
    id: "session-1",
    projectId: "colna/ccraft#main",
    repoFullName: "colna/ccraft",
    branch: "main",
    title: "修复登录错误",
    messages: [{
      id: "message-1",
      role: "user",
      content: "修复登录错误",
      createdAt: "2026-05-11T00:00:00.000Z"
    }],
    pendingChanges: [{
      filePath: "src/App.tsx",
      type: "modified",
      hunks: [],
      additions: 1,
      deletions: 0,
      rawDiff: "--- a/src/App.tsx\n+++ b/src/App.tsx",
      selected: true
    }],
    status: "active",
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  };
}
