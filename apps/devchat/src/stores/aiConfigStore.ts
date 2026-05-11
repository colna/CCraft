import type { AiConfig } from "@devchat/types";
import { create } from "zustand";
import { invokeCommand } from "../lib/tauri";

interface AiConfigState {
  configs: AiConfig[];
  activeConfig: AiConfig;
  connectionStatus: "idle" | "testing" | "ok" | "error";
  error: string | undefined;
  setActive: (id: string) => void;
  testConnection: () => Promise<void>;
}

const defaultConfig: AiConfig = {
  id: "default",
  name: "Claude Haiku 4.5",
  provider: "claude",
  baseUrl: "http://172.245.240.135:8080",
  model: "claude-haiku-4-5-20251001",
  apiKeySecretRef: "ai.default.apiKey",
  isActive: true
};

export const useAIConfigStore = create<AiConfigState>((set, get) => ({
  configs: [defaultConfig],
  activeConfig: defaultConfig,
  connectionStatus: "idle",
  error: undefined,
  setActive: (id) => {
    const configs = get().configs.map((config) => ({ ...config, isActive: config.id === id }));
    const activeConfig = configs.find((config) => config.id === id) ?? get().activeConfig;
    set({ configs, activeConfig });
  },
  testConnection: async () => {
    const config = get().activeConfig;
    set({ connectionStatus: "testing", error: undefined });
    try {
      const result = await invokeCommand<{ ok: boolean }>("test_ai_connection", {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKeySecretRef: config.apiKeySecretRef
      });
      set({ connectionStatus: result.ok ? "ok" : "error", error: result.ok ? undefined : "连接失败" });
    } catch (error) {
      set({ connectionStatus: "error", error: error instanceof Error ? error.message : "连接失败" });
    }
  }
}));
