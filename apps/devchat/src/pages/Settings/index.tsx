import { Github, KeyRound } from "lucide-react";
import { useState } from "react";
import { StatusPill } from "../../components/StatusPill";
import { invokeCommand } from "../../lib/tauri";
import { useAIConfigStore } from "../../stores/aiConfigStore";

export function SettingsPage() {
  const activeConfig = useAIConfigStore((state) => state.activeConfig);
  const connectionStatus = useAIConfigStore((state) => state.connectionStatus);
  const testConnection = useAIConfigStore((state) => state.testConnection);
  const [apiKey, setApiKey] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveStatus("error");
      return;
    }

    setSaveStatus("saving");
    try {
      await invokeCommand("save_secret", { key: activeConfig.apiKeySecretRef, value: apiKey.trim() });
      setApiKey("");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

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
          <span>配置名称</span>
          <input value={activeConfig.name} readOnly />
        </label>
        <label className="field-block">
          <span>Provider</span>
          <input value={activeConfig.provider} readOnly />
        </label>
        <label className="field-block">
          <span>Base URL</span>
          <input value={activeConfig.baseUrl} readOnly />
        </label>
        <label className="field-block">
          <span>API Key</span>
          <input value={activeConfig.maskedKey ?? "未配置"} readOnly />
        </label>
        <label className="field-block">
          <span>保存 Claude API Key</span>
          <input
            aria-label="Claude API Key"
            autoComplete="off"
            onChange={(event) => {
              setApiKey(event.target.value);
              setSaveStatus("idle");
            }}
            placeholder="只会保存到 Rust 安全存储"
            type="password"
            value={apiKey}
          />
        </label>
        <label className="field-block">
          <span>Model</span>
          <input value={activeConfig.model} readOnly />
        </label>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={saveApiKey}>
            {saveStatus === "saving" ? "保存中" : "保存 Key"}
          </button>
          <button className="secondary-action" type="button" onClick={testConnection}>测试连接</button>
        </div>
        {saveStatus === "saved" ? <p className="helper-text">API Key 已保存。</p> : null}
        {saveStatus === "error" ? <p className="helper-text warn-text">请填写有效 API Key 后再保存。</p> : null}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2><Github size={18} /> GitHub</h2>
          <StatusPill tone="ok">已绑定</StatusPill>
        </div>
        <p>OAuth token 仅保存在 Rust 安全层，前端只读取授权状态。</p>
      </section>
    </section>
  );
}
