import { useChatStore } from "../stores/chatStore";

export function useAI() {
  const messages = useChatStore((state) => state.messages);
  const isGenerating = useChatStore((state) => state.isGenerating);
  const pendingDiffs = useChatStore((state) => state.pendingDiffs);
  const error = useChatStore((state) => state.error);
  const canRetry = useChatStore((state) => Boolean(state.lastFailedUserMessageId));
  const sendMessage = useChatStore((state) => state.sendMessage);
  const retryLastMessage = useChatStore((state) => state.retryLastMessage);
  const clearError = useChatStore((state) => state.clearError);
  const stopGeneration = useChatStore((state) => state.stopGeneration);

  return { messages, isGenerating, pendingDiffs, error, canRetry, sendMessage, retryLastMessage, clearError, stopGeneration };
}
