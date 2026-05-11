import { FileCode2, RefreshCw, Send, Square, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { BranchSelector } from "../../components/BranchSelector";
import { StatusPill } from "../../components/StatusPill";
import { useAI } from "../../hooks/useAI";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { useProjectStore } from "../../stores/projectStore";

export function ChatPage() {
  const { messages, isGenerating, pendingDiffs, error, canRetry, sendMessage, retryLastMessage, clearError, stopGeneration } = useAI();
  const currentProject = useProjectStore((state) => state.currentProject);
  const snapshotProgress = useProjectStore((state) => state.snapshotProgress);
  const isProjectLoading = useProjectStore((state) => state.isLoading);
  const refreshSnapshot = useProjectStore((state) => state.refreshSnapshot);
  const activeConfig = useAIConfigStore((state) => state.activeConfig);
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();
    if (!content) return;
    setValue("");
    await sendMessage(content);
  }

  return (
    <section className="chat-layout">
      <header className="chat-header">
        <div>
          <h1>{currentProject ? `${currentProject.repoName} · ${currentProject.branch}` : "未选择项目"}</h1>
          <p>{currentProject?.snapshot?.techStack.framework ?? "选择项目后加载真实快照"}</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-link"
            aria-label="刷新项目快照"
            disabled={!currentProject || isProjectLoading}
            onClick={() => void refreshSnapshot({ refresh: true })}
          >
            <RefreshCw size={20} />
          </button>
          <Link to="/diff" className="icon-link" aria-label="查看全部变更">
            <FileCode2 size={20} />
          </Link>
        </div>
      </header>
      <div className="chat-context-strip" aria-label="当前对话上下文">
        <span>
          <strong>项目</strong>
          {currentProject?.repoFullName ?? "未选择"}
        </span>
        <span>
          <strong>分支</strong>
          {currentProject?.branch ?? "-"}
        </span>
        <span>
          <strong>模型</strong>
          {activeConfig.name} · {activeConfig.model}
        </span>
        <StatusPill tone={currentProject?.snapshot ? "ok" : "info"}>
          {currentProject?.snapshot ? "快照已就绪" : "等待快照"}
        </StatusPill>
      </div>
      <BranchSelector variant="compact" />
      {snapshotProgress ? (
        <p className="helper-text">{snapshotProgress.message} · {snapshotProgress.percent}%</p>
      ) : null}

      <div className="message-list">
        {messages.map((message) => (
          <article key={message.id} className={`message-bubble message-${message.role}`}>
            <span>{message.role === "user" ? "用户" : "AI"}</span>
            <ReactMarkdown>
              {message.role === "assistant" && !message.content && isGenerating ? "正在生成..." : message.content}
            </ReactMarkdown>
          </article>
        ))}
        {pendingDiffs.length > 0 && (
          <Link to="/diff" className="diff-card">
            <strong>查看全部变更</strong>
            <span>{pendingDiffs.length} 个文件 · +{pendingDiffs.reduce((sum, diff) => sum + diff.additions, 0)}</span>
          </Link>
        )}
        {error ? (
          <div className="chat-error" role="alert">
            <p className="helper-text warn-text">{error}</p>
            <div className="error-actions">
              <button type="button" className="secondary-action" onClick={() => void retryLastMessage()} disabled={!canRetry || isGenerating}>
                <RefreshCw size={16} /> 重试
              </button>
              <button type="button" className="secondary-action" onClick={clearError}>
                <X size={16} /> 关闭
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="输入你的需求..."
          aria-label="输入你的需求"
        />
        {isGenerating ? (
          <button type="button" onClick={stopGeneration} aria-label="停止生成">
            <Square size={18} />
          </button>
        ) : (
          <button type="submit" aria-label="发送">
            <Send size={18} />
          </button>
        )}
      </form>
    </section>
  );
}
