import type { FileDiff, Message } from "@devchat/types";
import { create } from "zustand";

const AI_STREAMING_NOT_CONNECTED =
  "真实 AI 流式对话尚未接入，请按 docs/任务计划.md 的 R3.2/R3.4 实现后再生成回复。";

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
    const now = new Date().toISOString();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content, createdAt: now };
    set((state) => ({
      messages: [...state.messages, userMsg],
      error: AI_STREAMING_NOT_CONNECTED,
      isGenerating: false,
      pendingDiffs: state.pendingDiffs
    }));
  },
  stopGeneration: () => set({ isGenerating: false }),
  toggleDiff: (filePath) => {
    set({
      pendingDiffs: get().pendingDiffs.map((diff) =>
        diff.filePath === filePath ? { ...diff, selected: !diff.selected } : diff
      )
    });
  }
}));
