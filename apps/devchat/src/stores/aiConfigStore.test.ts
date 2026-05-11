import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn()
}));

vi.mock("../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand
}));

import { useAIConfigStore } from "./aiConfigStore";
import type { UserConfig } from "@devchat/types";

const persistedConfig: UserConfig = {
  version: 1,
  aiConfigs: [
    {
      id: "default",
      name: "Claude Haiku 4.5",
      provider: "claude",
      baseUrl: "http://172.245.240.135:8080",
      model: "claude-haiku-4-5-20251001",
      apiKeySecretRef: "ai.default.apiKey",
      isActive: false
    },
    {
      id: "work",
      name: "Work Claude",
      provider: "claude",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      apiKeySecretRef: "ai.work.apiKey",
      isActive: true
    },
    {
      id: "openai",
      name: "OpenAI-compatible",
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com",
      model: "gpt-4.1-mini",
      apiKeySecretRef: "ai.openai.apiKey",
      isActive: false
    }
  ],
  githubAuthStatus: "configured",
  preferences: {
    theme: "system",
    language: "zh-CN",
    defaultBranch: "main"
  }
};

describe("aiConfigStore", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockReset();
    useAIConfigStore.setState({
      configs: [persistedConfig.aiConfigs[0]!],
      activeConfig: persistedConfig.aiConfigs[0]!,
      githubAuthStatus: "not_configured",
      preferences: persistedConfig.preferences,
      isLoading: false,
      saveStatus: "idle",
      connectionStatus: "idle",
      error: undefined
    });
  });

  it("loads persisted non-sensitive config state", async () => {
    tauriMock.invokeCommand.mockResolvedValue(persistedConfig);

    await useAIConfigStore.getState().loadConfig();

    const state = useAIConfigStore.getState();
    expect(tauriMock.invokeCommand).toHaveBeenCalledWith("load_user_config");
    expect(state.configs).toHaveLength(3);
    expect(state.activeConfig.id).toBe("work");
    expect(state.githubAuthStatus).toBe("configured");
    expect(state.isLoading).toBe(false);
  });

  it("saves an AI config through the Tauri command and applies the returned state", async () => {
    tauriMock.invokeCommand.mockResolvedValue(persistedConfig);

    await useAIConfigStore.getState().saveConfig(persistedConfig.aiConfigs[1]!);

    expect(tauriMock.invokeCommand).toHaveBeenCalledWith("save_ai_config", {
      config: persistedConfig.aiConfigs[1]!
    });
    expect(useAIConfigStore.getState().activeConfig.id).toBe("work");
    expect(useAIConfigStore.getState().saveStatus).toBe("saved");
  });

  it("activates and deletes configs through persisted commands", async () => {
    tauriMock.invokeCommand.mockResolvedValue(persistedConfig);

    await useAIConfigStore.getState().setActive("work");
    await useAIConfigStore.getState().deleteConfig("default");

    expect(tauriMock.invokeCommand).toHaveBeenNthCalledWith(1, "set_active_ai_config", { id: "work" });
    expect(tauriMock.invokeCommand).toHaveBeenNthCalledWith(2, "delete_ai_config", { id: "default" });
  });

  it("marks the connection as ok when the Tauri command returns true", async () => {
    tauriMock.invokeCommand.mockResolvedValue(true);

    await useAIConfigStore.getState().testConnection();

    expect(useAIConfigStore.getState().connectionStatus).toBe("ok");
    expect(useAIConfigStore.getState().error).toBeUndefined();
  });

  it("passes OpenAI-compatible config fields to the Tauri connection test", async () => {
    useAIConfigStore.setState({
      configs: persistedConfig.aiConfigs,
      activeConfig: persistedConfig.aiConfigs[2]!
    });
    tauriMock.invokeCommand.mockResolvedValue(true);

    await useAIConfigStore.getState().testConnection();

    expect(tauriMock.invokeCommand).toHaveBeenCalledWith("test_ai_connection", {
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com",
      model: "gpt-4.1-mini",
      apiKeySecretRef: "ai.openai.apiKey"
    });
    expect(useAIConfigStore.getState().connectionStatus).toBe("ok");
  });

  it("marks the connection as failed when the Tauri command returns false", async () => {
    tauriMock.invokeCommand.mockResolvedValue(false);

    await useAIConfigStore.getState().testConnection();

    expect(useAIConfigStore.getState().connectionStatus).toBe("error");
    expect(useAIConfigStore.getState().error).toBe("连接失败");
  });
});
