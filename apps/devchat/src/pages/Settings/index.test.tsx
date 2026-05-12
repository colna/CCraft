import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiConfig, UserConfig } from "@devchat/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { SettingsPage } from ".";

const tauriMock = vi.hoisted(() => ({
  invokeCommand: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  invokeCommand: tauriMock.invokeCommand
}));

const configs: AiConfig[] = [
  {
    id: "claude-work",
    name: "Claude Work",
    provider: "claude",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    apiKeySecretRef: "ai.claude-work.apiKey",
    isActive: true
  },
  {
    id: "openai-work",
    name: "OpenAI Work",
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com",
    model: "gpt-4.1-mini",
    apiKeySecretRef: "ai.openai-work.apiKey",
    isActive: false
  }
];

const userConfig: UserConfig = {
  version: 1,
  aiConfigs: configs,
  githubAuthStatus: "not_configured",
  preferences: {
    theme: "system",
    language: "zh-CN",
    defaultBranch: "main"
  }
};

function userConfigWithActive(id: string): UserConfig {
  return {
    ...userConfig,
    aiConfigs: userConfig.aiConfigs.map((config) => ({ ...config, isActive: config.id === id }))
  };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    tauriMock.invokeCommand.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "load_user_config") {
        return userConfig;
      }
      if (command === "has_secret") {
        return args?.key === "ai.claude-work.apiKey";
      }
      if (command === "save_secret") {
        return undefined;
      }
      if (command === "save_ai_config") {
        const config = args?.config as AiConfig;
        return userConfigWithActive(config.id);
      }
      if (command === "set_active_ai_config") {
        return userConfigWithActive(String(args?.id));
      }
      if (command === "delete_ai_config") {
        return userConfigWithActive("claude-work");
      }
      if (command === "test_ai_connection") {
        return true;
      }
      if (command === "update_user_preferences") {
        return userConfig;
      }
      throw new Error(`unexpected command ${command}`);
    });
    useAIConfigStore.setState({
      configs,
      activeConfig: configs[0]!,
      githubAuthStatus: "not_configured",
      preferences: userConfig.preferences,
      isLoading: false,
      saveStatus: "idle",
      connectionStatus: "idle",
      error: undefined
    });
  });

  it("keeps AI config editing collapsed by default and hides internal secret refs", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("当前 AI 配置")).toBeTruthy();
    });

    expect(screen.queryByLabelText("AI Provider")).toBeNull();
    expect(screen.queryByText("Secret Ref")).toBeNull();
    expect(screen.queryByText("所选配置 API Key")).toBeNull();
    expect(screen.getByText("Key 已保存")).toBeTruthy();
  });

  it("opens the compact form from add and saves API key separately from config metadata", async () => {
    const randomSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue("12345678-90ab-cdef-1234-567890abcdef");

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "新增 AI 配置" }));

    expect(screen.getByLabelText("AI Provider")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("AI API Key"), { target: { value: "test-api-key" } });
    fireEvent.change(screen.getByLabelText("配置名称"), {
      target: { value: "Production OpenAI" }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://llm.example.com" }
    });
    fireEvent.change(screen.getByLabelText("Model Id"), {
      target: { value: "gpt-4.1-mini" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith("save_secret", {
        key: "ai.openai-12345678.apiKey",
        value: "test-api-key"
      });
    });
    expect(tauriMock.invokeCommand).toHaveBeenCalledWith(
      "save_ai_config",
      expect.objectContaining({
        config: expect.objectContaining({
          id: "openai-12345678",
          name: "Production OpenAI",
          provider: "openai-compatible",
          baseUrl: "https://llm.example.com",
          model: "gpt-4.1-mini",
          apiKeySecretRef: "ai.openai-12345678.apiKey"
        })
      })
    );
    const saveConfigCall = tauriMock.invokeCommand.mock.calls.find(([command]) => command === "save_ai_config");
    expect(JSON.stringify(saveConfigCall?.[1])).not.toContain("test-api-key");

    randomSpy.mockRestore();
  });

  it("activates the selected config from the dropdown", async () => {
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("当前 AI 配置"), { target: { value: "openai-work" } });

    await waitFor(() => {
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith("set_active_ai_config", { id: "openai-work" });
    });
  });

  it("tests and deletes the current persisted config from the picker actions", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "测试 AI 连接" }));
    fireEvent.click(screen.getByRole("button", { name: "删除当前 AI 配置" }));

    await waitFor(() => {
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith(
        "test_ai_connection",
        expect.objectContaining({
          provider: "claude",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-5",
          apiKeySecretRef: "ai.claude-work.apiKey"
        })
      );
      expect(tauriMock.invokeCommand).toHaveBeenCalledWith("delete_ai_config", { id: "claude-work" });
    });
  });
});
