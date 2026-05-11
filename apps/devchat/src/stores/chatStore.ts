import type { FileDiff, Message, Project, Session } from "@devchat/types";
import { create } from "zustand";
import { parseAiChangeResponse } from "../lib/diffParser";
import { buildChatMessages, buildSystemPrompt } from "../lib/promptBuilder";
import { invokeCommand, listenCommandEvent } from "../lib/tauri";
import { useAIConfigStore } from "./aiConfigStore";
import { useProjectStore } from "./projectStore";

type StreamChunkEvent = {
  requestId: string;
  text: string;
};

type StreamErrorEvent = {
  requestId: string;
  message: string;
};

type StreamDoneEvent = {
  requestId: string;
};

let activeStreamId: string | undefined;
const stoppedStreamIds = new Set<string>();

interface ChatState {
  messages: Message[];
  isGenerating: boolean;
  pendingDiffs: FileDiff[];
  sessions: Session[];
  currentSessionId: string | undefined;
  currentSessionStatus: Session["status"] | undefined;
  error: string | undefined;
  lastFailedUserMessageId: string | undefined;
  loadSessions: () => Promise<void>;
  openSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  startNewSession: () => void;
  markCurrentSessionCommitted: (commitSha: string, commitUrl?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearError: () => void;
  stopGeneration: () => void;
  toggleDiff: (filePath: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  pendingDiffs: [],
  sessions: [],
  currentSessionId: undefined,
  currentSessionStatus: undefined,
  error: undefined,
  lastFailedUserMessageId: undefined,
  loadSessions: async () => {
    try {
      const sessions = await invokeCommand<Session[]>("load_chat_sessions");
      set({ sessions, error: undefined });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "历史会话加载失败" });
    }
  },
  openSession: (sessionId) => {
    const session = get().sessions.find((session) => session.id === sessionId);
    if (!session) return;

    set({
      currentSessionId: session.id,
      currentSessionStatus: session.status,
      messages: session.messages,
      pendingDiffs: session.status === "committed" ? [] : session.pendingChanges,
      error: undefined,
      lastFailedUserMessageId: undefined,
      isGenerating: false
    });
  },
  deleteSession: async (sessionId) => {
    try {
      const sessions = await invokeCommand<Session[]>("delete_chat_session", { id: sessionId });
      const isCurrentSession = get().currentSessionId === sessionId;
      set({
        sessions,
        ...(isCurrentSession
          ? {
              currentSessionId: undefined,
              currentSessionStatus: undefined,
              messages: [],
              pendingDiffs: [],
              lastFailedUserMessageId: undefined
            }
          : {}),
        error: undefined
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "历史会话删除失败" });
      throw error;
    }
  },
  startNewSession: () => {
    set({
      messages: [],
      pendingDiffs: [],
      currentSessionId: undefined,
      currentSessionStatus: undefined,
      error: undefined,
      lastFailedUserMessageId: undefined,
      isGenerating: false
    });
  },
  markCurrentSessionCommitted: async (commitSha, commitUrl) => {
    const sessionId = get().currentSessionId;
    if (!sessionId) return;

    try {
      const sessions = await invokeCommand<Session[]>("mark_chat_session_committed", {
        id: sessionId,
        commitSha,
        commitUrl,
        updatedAt: new Date().toISOString()
      });
      set({
        sessions,
        pendingDiffs: [],
        currentSessionStatus: "committed",
        error: undefined,
        lastFailedUserMessageId: undefined
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "会话提交状态保存失败" });
      throw error;
    }
  },
  sendMessage: async (content) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || get().isGenerating) {
      return;
    }
    if (get().currentSessionStatus === "committed") {
      set({ error: "已提交会话为只读，请开始新会话后继续对话" });
      return;
    }

    const previousMessages = get().messages;
    const now = new Date().toISOString();
    const streamId = crypto.randomUUID();
    const sessionId = get().currentSessionId ?? crypto.randomUUID();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmedContent, createdAt: now };
    await startAssistantStream(set, get, {
      streamId,
      sessionId,
      userMessageId: userMsg.id,
      conversation: [...previousMessages, userMsg],
      nextMessages: [...previousMessages, userMsg],
      createdAt: now
    });
  },
  retryLastMessage: async () => {
    if (get().isGenerating) {
      return;
    }

    const failedUserMessageId = get().lastFailedUserMessageId;
    const previousMessages = get().messages;
    const failedUserMessage = previousMessages.find(
      (message) => message.id === failedUserMessageId && message.role === "user"
    );

    if (!failedUserMessage) {
      return;
    }

    await startAssistantStream(set, get, {
      streamId: crypto.randomUUID(),
      sessionId: get().currentSessionId ?? crypto.randomUUID(),
      userMessageId: failedUserMessage.id,
      conversation: previousMessages,
      nextMessages: previousMessages,
      createdAt: new Date().toISOString()
    });
  },
  clearError: () => {
    set({ error: undefined, lastFailedUserMessageId: undefined });
  },
  stopGeneration: () => {
    if (activeStreamId) {
      stoppedStreamIds.add(activeStreamId);
    }
    set({ isGenerating: false });
  },
  toggleDiff: (filePath) => {
    set({
      pendingDiffs: get().pendingDiffs.map((diff) =>
        diff.filePath === filePath ? { ...diff, selected: !diff.selected } : diff
      )
    });
    void persistCurrentSession(set, get);
  }
}));

type StartAssistantStreamOptions = {
  streamId: string;
  sessionId: string;
  userMessageId: string;
  conversation: Message[];
  nextMessages: Message[];
  createdAt: string;
};

async function startAssistantStream(
  set: (
    partial:
      | Partial<ChatState>
      | ((state: ChatState) => Partial<ChatState>)
  ) => void,
  get: () => ChatState,
  options: StartAssistantStreamOptions
) {
  const { streamId, sessionId, userMessageId, conversation, nextMessages, createdAt } = options;
  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    createdAt
  };
  const config = useAIConfigStore.getState().activeConfig;
  const project = useProjectStore.getState().currentProject;
  const commandMessages = buildChatMessages(conversation);
  const systemPrompt = buildSystemPrompt({ project, history: conversation });
  let streamHadError = false;
  let unlistenChunk: (() => void) | undefined;
  let unlistenDone: (() => void) | undefined;
  let unlistenError: (() => void) | undefined;
  activeStreamId = streamId;

  set({
    currentSessionId: sessionId,
    currentSessionStatus: "active",
    messages: [...nextMessages, assistantMsg],
    error: undefined,
    lastFailedUserMessageId: undefined,
    isGenerating: true
  });

  try {
    [unlistenChunk, unlistenDone, unlistenError] = await Promise.all([
      listenCommandEvent<StreamChunkEvent>("ai-stream-chunk", (event) => {
        if (event.requestId !== streamId || stoppedStreamIds.has(streamId)) {
          return;
        }

        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMsg.id ? { ...message, content: message.content + event.text } : message
          )
        }));
      }),
      listenCommandEvent<StreamDoneEvent>("ai-stream-done", (event) => {
        if (event.requestId !== streamId) {
          return;
        }

        set({ isGenerating: false });
      }),
      listenCommandEvent<StreamErrorEvent>("ai-stream-error", (event) => {
        if (event.requestId !== streamId || stoppedStreamIds.has(streamId)) {
          return;
        }

        streamHadError = true;
        set((state) => ({
          error: event.message || "AI streaming failed",
          lastFailedUserMessageId: userMessageId,
          isGenerating: false,
          messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
        }));
      })
    ]);

    await invokeCommand<void>("chat_stream", {
      requestId: streamId,
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKeySecretRef: config.apiKeySecretRef,
      model: config.model,
      messages: commandMessages,
      systemPrompt
    });

    set((state) => {
      const shouldSkipParse = streamHadError || stoppedStreamIds.has(streamId);
      return {
        isGenerating: false,
        lastFailedUserMessageId: shouldSkipParse ? state.lastFailedUserMessageId : undefined,
        ...parsePendingDiffState(state, assistantMsg.id, shouldSkipParse),
        messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
      };
    });
    await persistCurrentSession(set, get);
  } catch (error) {
    set((state) => ({
      isGenerating: false,
      error: stoppedStreamIds.has(streamId)
        ? state.error
        : error instanceof Error
          ? error.message
          : "AI streaming failed",
      lastFailedUserMessageId: stoppedStreamIds.has(streamId) ? state.lastFailedUserMessageId : userMessageId,
      messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
    }));
    await persistCurrentSession(set, get);
  } finally {
    unlistenChunk?.();
    unlistenDone?.();
    unlistenError?.();
    stoppedStreamIds.delete(streamId);
    if (activeStreamId === streamId) {
      activeStreamId = undefined;
    }
  }
}

async function persistCurrentSession(
  set: (
    partial:
      | Partial<ChatState>
      | ((state: ChatState) => Partial<ChatState>)
  ) => void,
  get: () => ChatState
) {
  const state = get();
  const project = useProjectStore.getState().currentProject;
  const session = buildSessionFromState(state, project);
  if (!session) return;

  try {
    const sessions = await invokeCommand<Session[]>("save_chat_session", { session });
    set({ sessions });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : "历史会话保存失败" });
  }
}

function buildSessionFromState(state: ChatState, project: Project | null): Session | null {
  if (!project || state.messages.length === 0 || !state.currentSessionId) {
    return null;
  }

  const existingSession = state.sessions.find((session) => session.id === state.currentSessionId);
  const firstMessage = state.messages[0];
  const now = new Date().toISOString();
  const title = state.messages.find((message) => message.role === "user")?.content ?? project.repoFullName;

  return {
    id: state.currentSessionId,
    projectId: `${project.repoFullName}#${project.branch}`,
    repoFullName: project.repoFullName,
    branch: project.branch,
    title: title.slice(0, 80),
    messages: state.messages,
    pendingChanges: state.currentSessionStatus === "committed" ? [] : state.pendingDiffs,
    status: state.currentSessionStatus ?? "active",
    ...(existingSession?.commitSha ? { commitSha: existingSession.commitSha } : {}),
    ...(existingSession?.commitUrl ? { commitUrl: existingSession.commitUrl } : {}),
    createdAt: existingSession?.createdAt ?? firstMessage?.createdAt ?? now,
    updatedAt: now
  };
}

function removeEmptyAssistantMessage(messages: Message[], assistantId: string): Message[] {
  return messages.filter((message) => message.id !== assistantId || message.content.trim().length > 0);
}

function parsePendingDiffState(
  state: ChatState,
  assistantId: string,
  skipParse: boolean
): Pick<ChatState, "pendingDiffs" | "error"> {
  if (skipParse) {
    return { pendingDiffs: state.pendingDiffs, error: state.error };
  }

  const assistantContent = state.messages.find((message) => message.id === assistantId)?.content ?? "";
  const result = parseAiChangeResponse(assistantContent);

  if (result.status === "parsed") {
    return { pendingDiffs: result.diffs, error: undefined };
  }

  if (result.status === "invalid") {
    return { pendingDiffs: [], error: `无法解析 AI 输出的 diff：${result.error}` };
  }

  return { pendingDiffs: state.pendingDiffs, error: undefined };
}
