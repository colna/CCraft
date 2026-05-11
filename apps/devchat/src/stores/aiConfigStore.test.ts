import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn()
}));

vi.mock("../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand
}));

import { useAIConfigStore } from "./aiConfigStore";

describe("aiConfigStore", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockReset();
    useAIConfigStore.setState({
      connectionStatus: "idle",
      error: undefined
    });
  });

  it("marks the connection as ok when the Tauri command returns true", async () => {
    tauriMock.invokeCommand.mockResolvedValue(true);

    await useAIConfigStore.getState().testConnection();

    expect(useAIConfigStore.getState().connectionStatus).toBe("ok");
    expect(useAIConfigStore.getState().error).toBeUndefined();
  });

  it("marks the connection as failed when the Tauri command returns false", async () => {
    tauriMock.invokeCommand.mockResolvedValue(false);

    await useAIConfigStore.getState().testConnection();

    expect(useAIConfigStore.getState().connectionStatus).toBe("error");
    expect(useAIConfigStore.getState().error).toBe("连接失败");
  });
});
