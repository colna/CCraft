import { FileCode2, Send, Square } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { BranchSelector } from "../../components/BranchSelector";
import { useAI } from "../../hooks/useAI";
import { useProjectStore } from "../../stores/projectStore";

export function ChatPage() {
  const { messages, isGenerating, pendingDiffs, error, sendMessage, stopGeneration } = useAI();
  const currentProject = useProjectStore((state) => state.currentProject);
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
        <Link to="/diff" className="icon-link" aria-label="查看全部变更">
          <FileCode2 size={20} />
        </Link>
      </header>
      <BranchSelector variant="compact" />

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
        {error ? <p className="helper-text warn-text">{error}</p> : null}
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
