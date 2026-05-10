import type { FileDiff, Message } from "@devchat/types";
import { create } from "zustand";
import { demoDiff, demoSession } from "../lib/mockData";

interface ChatState {
  messages: Message[];
  isGenerating: boolean;
  pendingDiffs: FileDiff[];
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  toggleDiff: (filePath: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: demoSession.messages,
  isGenerating: false,
  pendingDiffs: demoSession.pendingChanges,
  sendMessage: async (content) => {
    const now = new Date().toISOString();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content, createdAt: now };
    set((state) => ({ messages: [...state.messages, userMsg], isGenerating: true }));

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "我来帮你添加搜索功能。需要修改 1 个文件，已生成 Diff 供你审查。",
      createdAt: new Date().toISOString()
    };

    set((state) => ({
      messages: [...state.messages, assistantMsg],
      pendingDiffs: state.pendingDiffs.length > 0 ? state.pendingDiffs : [demoDiff],
      isGenerating: false
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
