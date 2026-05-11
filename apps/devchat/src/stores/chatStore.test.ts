import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isGenerating: false,
      pendingDiffs: [],
      error: undefined
    });
  });

  it("does not generate demo replies or diffs before real streaming is connected", async () => {
    await useChatStore.getState().sendMessage("帮我修复登录错误");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.pendingDiffs).toEqual([]);
    expect(state.isGenerating).toBe(false);
    expect(state.error).toContain("R3");
  });
});
