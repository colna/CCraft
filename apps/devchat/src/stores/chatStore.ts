import type { FileDiff, Message, Project } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand, listenCommandEvent } from "../lib/tauri";
import { useAIConfigStore } from "./aiConfigStore";
import { useProjectStore } from "./projectStore";

type ChatCommandMessage = {
  role: "user" | "assistant";
  content: string;
};

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
  error: string | undefined;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  toggleDiff: (filePath: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  pendingDiffs: [],
  error: undefined,
  sendMessage: async (content) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || get().isGenerating) {
      return;
    }

    const previousMessages = get().messages;
    const now = new Date().toISOString();
    const streamId = crypto.randomUUID();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmedContent, createdAt: now };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: now
    };
    const config = useAIConfigStore.getState().activeConfig;
    const project = useProjectStore.getState().currentProject;
    const commandMessages = toCommandMessages([...previousMessages, userMsg]);
    const systemPrompt = buildSystemPrompt(project);
    let streamHadError = false;
    let unlistenChunk: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    activeStreamId = streamId;

    set({
      messages: [...previousMessages, userMsg, assistantMsg],
      error: undefined,
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
            isGenerating: false,
            messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
          }));
        })
      ]);

      await invokeCommand<void>("chat_stream", {
        requestId: streamId,
        baseUrl: config.baseUrl,
        apiKeySecretRef: config.apiKeySecretRef,
        model: config.model,
        messages: commandMessages,
        systemPrompt
      });

      set((state) => ({
        isGenerating: false,
        error: streamHadError || stoppedStreamIds.has(streamId) ? state.error : undefined,
        messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
      }));
    } catch (error) {
      set((state) => ({
        isGenerating: false,
        error: stoppedStreamIds.has(streamId)
          ? state.error
          : error instanceof Error
            ? error.message
            : "AI streaming failed",
        messages: removeEmptyAssistantMessage(state.messages, assistantMsg.id)
      }));
    } finally {
      unlistenChunk?.();
      unlistenDone?.();
      unlistenError?.();
      stoppedStreamIds.delete(streamId);
      if (activeStreamId === streamId) {
        activeStreamId = undefined;
      }
    }
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
  }
}));

function toCommandMessages(messages: Message[]): ChatCommandMessage[] {
  return messages.flatMap((message) => {
    if ((message.role === "user" || message.role === "assistant") && message.content.trim()) {
      return [{ role: message.role, content: message.content }];
    }

    return [];
  });
}

function buildSystemPrompt(project: Project | null | undefined): string {
  const lines = [
    "你是 DevChat 的代码协作助手。基于用户提供的真实项目上下文回答；只有在输出可审查 diff 时，才声称已经准备了代码变更。"
  ];

  if (!project) {
    lines.push("当前未选择项目。");
    return lines.join("\n");
  }

  lines.push(`当前仓库：${project.repoFullName}`);
  lines.push(`当前分支：${project.branch}`);

  if (project.snapshot) {
    const dependencies = project.snapshot.techStack.dependencies.slice(0, 12);
    const keyFiles = project.snapshot.keyFiles.slice(0, 12).map((file) => `${file.path}: ${file.summary}`);
    lines.push(`技术栈：${project.snapshot.techStack.language} / ${project.snapshot.techStack.framework}`);
    if (dependencies.length > 0) {
      lines.push(`依赖：${dependencies.join(", ")}`);
    }
    if (keyFiles.length > 0) {
      lines.push(`关键文件：\n${keyFiles.join("\n")}`);
    }
  }

  return lines.join("\n");
}

function removeEmptyAssistantMessage(messages: Message[], assistantId: string): Message[] {
  return messages.filter((message) => message.id !== assistantId || message.content.trim().length > 0);
}
