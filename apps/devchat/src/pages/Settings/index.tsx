import type { AiConfig, AiProvider, UserPreferences } from "@devchat/types";
import { Github, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusPill } from "../../components/StatusPill";
import { invokeCommand } from "../../lib/tauri";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { GITHUB_TOKEN_SECRET_REF } from "../../stores/projectStore";

const AI_PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "claude", label: "Anthropic Claude" }
];

export function SettingsPage() {
  const configs = useAIConfigStore((state) => state.configs);
  const activeConfig = useAIConfigStore((state) => state.activeConfig);
  const githubAuthStatus = useAIConfigStore((state) => state.githubAuthStatus);
  const preferences = useAIConfigStore((state) => state.preferences);
  const configSaveStatus = useAIConfigStore((state) => state.saveStatus);
  const configError = useAIConfigStore((state) => state.error);
  const loadConfig = useAIConfigStore((state) => state.loadConfig);
  const saveConfig = useAIConfigStore((state) => state.saveConfig);
  const setActive = useAIConfigStore((state) => state.setActive);
  const deleteConfig = useAIConfigStore((state) => state.deleteConfig);
  const updatePreferences = useAIConfigStore((state) => state.updatePreferences);
  const connectionStatus = useAIConfigStore((state) => state.connectionStatus);
  const testConnection = useAIConfigStore((state) => state.testConnection);
  const [draftConfig, setDraftConfig] = useState<AiConfig>(activeConfig);
  const [draftPreferences, setDraftPreferences] = useState<UserPreferences>(preferences);
  const [apiKey, setApiKey] = useState("");
  const [secretSaveStatus, setSecretSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [githubToken, setGithubToken] = useState("");
  const [githubSaveStatus, setGithubSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setDraftConfig(activeConfig);
  }, [activeConfig]);

  useEffect(() => {
    setDraftPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    let isMounted = true;

    async function loadSecretStatus() {
      try {
        const apiKeyConfigured = await invokeCommand<boolean>("has_secret", { key: draftConfig.apiKeySecretRef });

        if (isMounted) {
          setHasApiKey(apiKeyConfigured);
        }
      } catch {
        if (isMounted) {
          setHasApiKey(false);
        }
      }
    }

    void loadSecretStatus();
    return () => {
      isMounted = false;
    };
  }, [draftConfig.apiKeySecretRef]);

  const saveDraftConfig = async () => {
    try {
      await saveConfig(draftConfig);
    } catch {
    }
  };

  const activateDraftConfig = async () => {
    try {
      const savedConfig = configs.some((config) => config.id === draftConfig.id);
      if (!savedConfig) {
        await saveConfig({ ...draftConfig, isActive: true });
        return;
      }

      await setActive(draftConfig.id);
    } catch {
    }
  };

  const createDraftConfig = () => {
    const id = `openai-${crypto.randomUUID().slice(0, 8)}`;
    setDraftConfig({
      id,
      name: "OpenAI-compatible 配置",
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com",
      model: activeConfig.provider === "openai-compatible" ? activeConfig.model : "",
      apiKeySecretRef: `ai.${id}.apiKey`,
      isActive: false
    });
    setHasApiKey(false);
  };

  const deleteDraftConfig = async () => {
    try {
      await deleteConfig(draftConfig.id);
    } catch {
    }
  };

  const savePreferences = async () => {
    try {
      await updatePreferences(draftPreferences);
    } catch {
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setSecretSaveStatus("error");
      return;
    }

    setSecretSaveStatus("saving");
    try {
      await invokeCommand("save_secret", { key: draftConfig.apiKeySecretRef, value: apiKey.trim() });
      setApiKey("");
      setHasApiKey(true);
      setSecretSaveStatus("saved");
    } catch {
      setSecretSaveStatus("error");
    }
  };

  const saveGithubToken = async () => {
    if (!githubToken.trim()) {
      setGithubSaveStatus("error");
      return;
    }

    setGithubSaveStatus("saving");
    try {
      await invokeCommand("save_secret", { key: GITHUB_TOKEN_SECRET_REF, value: githubToken.trim() });
      setGithubToken("");
      await loadConfig();
      setGithubSaveStatus("saved");
    } catch {
      setGithubSaveStatus("error");
    }
  };

  const githubConfigured = githubAuthStatus === "configured";
  const githubStatusLabel =
    githubSaveStatus === "saving"
      ? "保存中"
      : githubSaveStatus === "error"
        ? "失败"
        : githubAuthStatus === "expired"
          ? "已过期"
          : githubAuthStatus === "invalid"
            ? "已失效"
            : githubConfigured
              ? "已保存"
              : "待配置";
  const githubStatusTone =
    githubSaveStatus === "error" || githubAuthStatus === "invalid" || githubAuthStatus === "expired"
      ? "warn"
      : githubConfigured
        ? "ok"
        : "info";

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1>设置</h1>
        <p>AI 模型、GitHub 授权和偏好设置。</p>
      </header>

      <section className="settings-card">
        <div className="section-heading">
          <h2><KeyRound size={18} /> AI 模型配置</h2>
          <StatusPill tone={connectionStatus === "ok" ? "ok" : connectionStatus === "error" ? "warn" : "info"}>
            {connectionStatus === "testing" ? "测试中" : connectionStatus === "ok" ? "可用" : connectionStatus === "error" ? "失败" : "待测试"}
          </StatusPill>
        </div>
        <label className="field-block">
          <span>配置</span>
          <select
            aria-label="AI 配置"
            value={draftConfig.id}
            onChange={(event) => {
              const selected = configs.find((config) => config.id === event.target.value);
              if (selected) setDraftConfig(selected);
            }}
          >
            {configs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.isActive ? "当前 · " : ""}{config.name}
              </option>
            ))}
            {!configs.some((config) => config.id === draftConfig.id) ? (
              <option value={draftConfig.id}>{draftConfig.name}</option>
            ) : null}
          </select>
        </label>
        <label className="field-block">
          <span>配置名称</span>
          <input
            value={draftConfig.name}
            onChange={(event) => setDraftConfig((config) => ({ ...config, name: event.target.value }))}
          />
        </label>
        <label className="field-block">
          <span>Provider</span>
          <select
            aria-label="AI Provider"
            value={draftConfig.provider}
            onChange={(event) =>
              setDraftConfig((config) => applyProviderDefaults(config, event.target.value as AiProvider))
            }
          >
            {AI_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-block">
          <span>Base URL</span>
          <input
            value={draftConfig.baseUrl}
            onChange={(event) => setDraftConfig((config) => ({ ...config, baseUrl: event.target.value }))}
          />
        </label>
        <label className="field-block">
          <span>所选配置 API Key</span>
          <input value={hasApiKey ? "已安全保存" : "未配置"} readOnly />
        </label>
        <label className="field-block">
          <span>保存 API Key</span>
          <input
            aria-label="AI API Key"
            autoComplete="off"
            onChange={(event) => {
              setApiKey(event.target.value);
              setSecretSaveStatus("idle");
            }}
            placeholder="只会保存到系统安全存储"
            type="password"
            value={apiKey}
          />
        </label>
        <label className="field-block">
          <span>Model</span>
          <input
            value={draftConfig.model}
            placeholder={draftConfig.provider === "openai-compatible" ? "兼容服务的模型名" : "Claude 模型名"}
            onChange={(event) => setDraftConfig((config) => ({ ...config, model: event.target.value }))}
          />
        </label>
        <label className="field-block">
          <span>Secret Ref</span>
          <input
            value={draftConfig.apiKeySecretRef}
            onChange={(event) => setDraftConfig((config) => ({ ...config, apiKeySecretRef: event.target.value }))}
          />
        </label>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={createDraftConfig}>
            <Plus size={16} /> 新增
          </button>
          <button className="secondary-action" type="button" onClick={saveDraftConfig}>
            <Save size={16} /> 保存配置
          </button>
          <button className="secondary-action" type="button" onClick={activateDraftConfig}>
            设为激活
          </button>
          <button className="secondary-action" type="button" onClick={deleteDraftConfig} disabled={configs.length <= 1}>
            <Trash2 size={16} /> 删除
          </button>
          <button className="secondary-action" type="button" onClick={saveApiKey}>
            {secretSaveStatus === "saving" ? "保存中" : "保存 Key"}
          </button>
          <button className="secondary-action" type="button" onClick={testConnection}>测试连接</button>
        </div>
        {configSaveStatus === "saved" ? <p className="helper-text">配置已保存。</p> : null}
        {configError ? <p className="helper-text warn-text">{configError}</p> : null}
        {secretSaveStatus === "saved" ? <p className="helper-text">API Key 已保存。</p> : null}
        {secretSaveStatus === "error" ? <p className="helper-text warn-text">请填写有效 API Key 后再保存。</p> : null}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2><Github size={18} /> GitHub</h2>
          <StatusPill tone={githubStatusTone}>{githubStatusLabel}</StatusPill>
        </div>
        <p>OAuth Proxy 接入前，先使用 GitHub Token 打通真实仓库与快照链路；token 仅保存到系统安全存储。</p>
        <label className="field-block">
          <span>GitHub Token</span>
          <input
            aria-label="GitHub Token"
            autoComplete="off"
            onChange={(event) => {
              setGithubToken(event.target.value);
              setGithubSaveStatus("idle");
            }}
            placeholder="需要 repo 读取权限"
            type="password"
            value={githubToken}
          />
        </label>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={saveGithubToken}>
            {githubSaveStatus === "saving" ? "保存中" : "保存 Token"}
          </button>
        </div>
        {githubSaveStatus === "saved" ? <p className="helper-text">GitHub Token 已保存，可到项目页加载真实仓库。</p> : null}
        {githubSaveStatus === "error" ? <p className="helper-text warn-text">请填写有效 Token，并确认当前运行在 Tauri App 中。</p> : null}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>偏好设置</h2>
          <StatusPill tone="info">{configSaveStatus === "saving" ? "保存中" : "本地保存"}</StatusPill>
        </div>
        <label className="field-block">
          <span>主题</span>
          <select
            value={draftPreferences.theme}
            onChange={(event) =>
              setDraftPreferences((value) => ({ ...value, theme: event.target.value as UserPreferences["theme"] }))
            }
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
        <label className="field-block">
          <span>语言</span>
          <select
            value={draftPreferences.language}
            onChange={(event) =>
              setDraftPreferences((value) => ({ ...value, language: event.target.value as UserPreferences["language"] }))
            }
          >
            <option value="zh-CN">zh-CN</option>
            <option value="en-US">en-US</option>
          </select>
        </label>
        <label className="field-block">
          <span>默认分支</span>
          <input
            value={draftPreferences.defaultBranch}
            onChange={(event) => setDraftPreferences((value) => ({ ...value, defaultBranch: event.target.value }))}
          />
        </label>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={savePreferences}>
            保存偏好
          </button>
        </div>
      </section>
    </section>
  );
}

function applyProviderDefaults(config: AiConfig, provider: AiProvider): AiConfig {
  if (config.provider === provider) {
    return config;
  }

  const model =
    provider === "openai-compatible" && config.model.startsWith("claude-")
      ? ""
      : provider === "claude" && !config.model.startsWith("claude-")
        ? ""
        : config.model;

  return {
    ...config,
    provider,
    baseUrl: provider === "openai-compatible" ? "https://api.openai.com" : "https://api.anthropic.com",
    model
  };
}
