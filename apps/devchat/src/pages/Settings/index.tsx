import type { AiConfig, AiProvider, UserPreferences } from "@devchat/types";
import { Github, KeyRound, Link2, Plus, Save, Trash2 } from "lucide-react";
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
  const [secretSaveError, setSecretSaveError] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubSaveStatus, setGithubSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isAiFormOpen, setIsAiFormOpen] = useState(false);
  const isDraftPersisted = configs.some((config) => config.id === draftConfig.id);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setDraftConfig(activeConfig);
    setApiKey("");
    setSecretSaveStatus("idle");
    setSecretSaveError("");
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
    let didSaveSecret = false;
    try {
      if (apiKey.trim()) {
        setSecretSaveStatus("saving");
        await invokeCommand("save_secret", { key: draftConfig.apiKeySecretRef, value: apiKey.trim() });
        didSaveSecret = true;
        setApiKey("");
        setHasApiKey(true);
        setSecretSaveStatus("saved");
        setSecretSaveError("");
      }
      await saveConfig(draftConfig);
      await setActive(draftConfig.id);
      setIsAiFormOpen(false);
    } catch (error) {
      if (apiKey.trim() && !didSaveSecret) {
        setSecretSaveStatus("error");
        setSecretSaveError(error instanceof Error ? error.message : "API Key 保存失败，请确认当前运行在 Tauri App 中。");
      }
    }
  };

  const createDraftConfig = () => {
    const id = `openai-${crypto.randomUUID().slice(0, 8)}`;
    setDraftConfig({
      id,
      name: `${activeConfig.name} 配置`,
      provider: activeConfig.provider,
      baseUrl: activeConfig.baseUrl,
      model: activeConfig.model,
      apiKeySecretRef: `ai.${id}.apiKey`,
      isActive: false
    });
    setApiKey("");
    setHasApiKey(false);
    setSecretSaveStatus("idle");
    setSecretSaveError("");
    setIsAiFormOpen(true);
  };

  const deleteDraftConfig = async () => {
    try {
      await deleteConfig(draftConfig.id);
      setIsAiFormOpen(false);
    } catch {
    }
  };

  const testSelectedConfig = async () => {
    if (!isDraftPersisted) {
      return;
    }

    try {
      if (activeConfig.id !== draftConfig.id) {
        await setActive(draftConfig.id);
      }
      await testConnection();
    } catch {
    }
  };

  const savePreferences = async () => {
    try {
      await updatePreferences(draftPreferences);
    } catch {
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
          <button className="icon-link" type="button" aria-label="新增 AI 配置" onClick={createDraftConfig}>
            <Plus size={18} />
          </button>
        </div>

        <div className="config-picker-row">
          <label className="field-block">
            <span>当前配置</span>
            <select
              aria-label="当前 AI 配置"
              value={draftConfig.id}
              onChange={(event) => {
                const selected = configs.find((config) => config.id === event.target.value);
                if (!selected) return;
                setDraftConfig(selected);
                setApiKey("");
                setSecretSaveStatus("idle");
                void setActive(selected.id);
              }}
            >
              {configs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
              {!configs.some((config) => config.id === draftConfig.id) ? (
                <option value={draftConfig.id}>{draftConfig.name}</option>
              ) : null}
            </select>
          </label>
          <button
            className="icon-link"
            type="button"
            aria-label="测试 AI 连接"
            onClick={testSelectedConfig}
            disabled={!isDraftPersisted || connectionStatus === "testing"}
          >
            <Link2 size={18} />
          </button>
          <button
            className="danger-action"
            type="button"
            aria-label="删除当前 AI 配置"
            onClick={deleteDraftConfig}
            disabled={configs.length <= 1 || !isDraftPersisted}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="config-summary-row">
          <StatusPill tone={connectionStatus === "ok" ? "ok" : connectionStatus === "error" ? "warn" : "info"}>
            {connectionStatus === "testing" ? "测试中" : connectionStatus === "ok" ? "连接可用" : connectionStatus === "error" ? "连接失败" : "待测试"}
          </StatusPill>
          <StatusPill tone={hasApiKey ? "ok" : "info"}>{hasApiKey ? "Key 已保存" : "Key 未配置"}</StatusPill>
          <button className="text-action" type="button" onClick={() => setIsAiFormOpen((value) => !value)}>
            {isAiFormOpen ? "收起表单" : "编辑配置"}
          </button>
        </div>

        {isAiFormOpen ? (
          <div className="config-form-panel">
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
              <span>API Key</span>
              <input
                aria-label="AI API Key"
                autoComplete="off"
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setSecretSaveStatus("idle");
                  setSecretSaveError("");
                }}
                placeholder={hasApiKey ? "留空则继续使用已保存 Key" : "保存到系统安全存储"}
                type="password"
                value={apiKey}
              />
            </label>
            <label className="field-block">
              <span>Model Id</span>
              <input
                value={draftConfig.model}
                placeholder={draftConfig.provider === "openai-compatible" ? "兼容服务的模型名" : "Claude 模型名"}
                onChange={(event) => setDraftConfig((config) => ({ ...config, model: event.target.value }))}
              />
            </label>
            <button
              className="primary-action"
              type="button"
              onClick={saveDraftConfig}
              disabled={configSaveStatus === "saving" || secretSaveStatus === "saving"}
            >
              <Save size={16} /> {configSaveStatus === "saving" || secretSaveStatus === "saving" ? "保存中" : "保存配置"}
            </button>
          </div>
        ) : null}

        {configSaveStatus === "saved" ? <p className="helper-text">配置已保存。</p> : null}
        {configError ? <p className="helper-text warn-text">{configError}</p> : null}
        {secretSaveStatus === "saved" ? <p className="helper-text">API Key 已保存。</p> : null}
        {secretSaveStatus === "error" ? (
          <p className="helper-text warn-text">{secretSaveError || "API Key 保存失败，请确认当前运行在 Tauri App 中。"}</p>
        ) : null}
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
