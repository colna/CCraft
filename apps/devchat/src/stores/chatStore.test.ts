import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, useAIConfigStore } from "./aiConfigStore";
import { useChatStore } from "./chatStore";

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
      error: undefined,
      lastFailedUserMessageId: undefined
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
});
