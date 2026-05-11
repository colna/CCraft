import type { AiConfig, GitHubAuthStatus, UserConfig, UserPreferences } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand } from "../lib/tauri";

interface AiConfigState {
  configs: AiConfig[];
  activeConfig: AiConfig;
  githubAuthStatus: GitHubAuthStatus;
  preferences: UserPreferences;
  isLoading: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  connectionStatus: "idle" | "testing" | "ok" | "error";
  error: string | undefined;
  loadConfig: () => Promise<void>;
  saveConfig: (config: AiConfig) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  updatePreferences: (preferences: UserPreferences) => Promise<void>;
  testConnection: () => Promise<void>;
}

export const defaultConfig: AiConfig = {
  id: "default",
  name: "Claude Haiku 4.5",
  provider: "claude",
  baseUrl: "http://172.245.240.135:8080",
  model: "claude-haiku-4-5-20251001",
  apiKeySecretRef: "ai.default.apiKey",
  isActive: true
};

const defaultPreferences: UserPreferences = {
  theme: "system",
  language: "zh-CN",
  defaultBranch: "main"
};

const defaultUserConfig: UserConfig = {
  version: 1,
  aiConfigs: [defaultConfig],
  githubAuthStatus: "not_configured",
  preferences: defaultPreferences
};

export const useAIConfigStore = create<AiConfigState>((set, get) => ({
  configs: [defaultConfig],
  activeConfig: defaultConfig,
  githubAuthStatus: "not_configured",
  preferences: defaultPreferences,
  isLoading: false,
  saveStatus: "idle",
  connectionStatus: "idle",
  error: undefined,
  loadConfig: async () => {
    set({ isLoading: true, error: undefined });
    try {
      const userConfig = await invokeCommand<UserConfig>("load_user_config");
      set({ ...stateFromUserConfig(userConfig), isLoading: false });
    } catch (error) {
      set({
        ...stateFromUserConfig(defaultUserConfig),
        isLoading: false,
        error: error instanceof Error ? error.message : "配置加载失败"
      });
    }
  },
  saveConfig: async (config) => {
    set({ saveStatus: "saving", error: undefined });
    try {
      const userConfig = await invokeCommand<UserConfig>("save_ai_config", { config });
      set({ ...stateFromUserConfig(userConfig), saveStatus: "saved" });
    } catch (error) {
      set({ saveStatus: "error", error: error instanceof Error ? error.message : "配置保存失败" });
      throw error;
    }
  },
  setActive: async (id) => {
    set({ saveStatus: "saving", error: undefined });
    try {
      const userConfig = await invokeCommand<UserConfig>("set_active_ai_config", { id });
      set({ ...stateFromUserConfig(userConfig), saveStatus: "saved" });
    } catch (error) {
      set({ saveStatus: "error", error: error instanceof Error ? error.message : "配置激活失败" });
      throw error;
    }
  },
  deleteConfig: async (id) => {
    set({ saveStatus: "saving", error: undefined });
    try {
      const userConfig = await invokeCommand<UserConfig>("delete_ai_config", { id });
      set({ ...stateFromUserConfig(userConfig), saveStatus: "saved" });
    } catch (error) {
      set({ saveStatus: "error", error: error instanceof Error ? error.message : "配置删除失败" });
      throw error;
    }
  },
  updatePreferences: async (preferences) => {
    set({ saveStatus: "saving", error: undefined });
    try {
      const userConfig = await invokeCommand<UserConfig>("update_user_preferences", { preferences });
      set({ ...stateFromUserConfig(userConfig), saveStatus: "saved" });
    } catch (error) {
      set({ saveStatus: "error", error: error instanceof Error ? error.message : "偏好保存失败" });
      throw error;
    }
  },
  testConnection: async () => {
    const config = get().activeConfig;
    set({ connectionStatus: "testing", error: undefined });
    try {
      const result = await invokeCommand<boolean>("test_ai_connection", {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKeySecretRef: config.apiKeySecretRef
      });
      set({ connectionStatus: result ? "ok" : "error", error: result ? undefined : "连接失败" });
    } catch (error) {
      set({ connectionStatus: "error", error: error instanceof Error ? error.message : "连接失败" });
    }
  }
}));

function stateFromUserConfig(userConfig: UserConfig): Pick<
  AiConfigState,
  "configs" | "activeConfig" | "githubAuthStatus" | "preferences"
> {
  const configs = userConfig.aiConfigs.length > 0 ? userConfig.aiConfigs : [defaultConfig];
  const activeConfig = configs.find((config) => config.isActive) ?? configs[0] ?? defaultConfig;

  return {
    configs,
    activeConfig,
    githubAuthStatus: userConfig.githubAuthStatus,
    preferences: userConfig.preferences
  };
}
