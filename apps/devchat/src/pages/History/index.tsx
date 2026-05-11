import { ArrowRight, GitCommit, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@devchat/types";
import { StatusPill } from "../../components/StatusPill";
import { useChatStore } from "../../stores/chatStore";

export function HistoryPage() {
  const navigate = useNavigate();
  const sessions = useChatStore((state) => state.sessions);
  const error = useChatStore((state) => state.error);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const openSession = useChatStore((state) => state.openSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const groupedSessions = useMemo(() => groupSessions(sessions), [sessions]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function continueSession(session: Session) {
    openSession(session.id);
    navigate(`/chat/${encodeURIComponent(session.projectId)}`);
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1>历史会话</h1>
        <p>按项目和分支回看对话、继续未提交会话或清理记录。</p>
      </header>

      {error ? <p className="helper-text warn-text" role="alert">{error}</p> : null}

      {groupedSessions.length === 0 ? (
        <div className="empty-state">暂无历史会话</div>
      ) : (
        groupedSessions.map((group) => (
          <section className="section-block" key={group.key}>
            <div className="section-heading">
              <h2>{group.repoFullName}</h2>
              <StatusPill tone="info">{group.branch}</StatusPill>
            </div>
            <div className="history-list">
              {group.sessions.map((session) => (
                <article className="history-row" key={session.id}>
                  <button type="button" className="history-row-main" onClick={() => continueSession(session)}>
                    <span>
                      <strong>{session.title}</strong>
                      <small>{formatDate(session.updatedAt)} · {session.messages.length} 条消息</small>
                    </span>
                    <StatusPill tone={session.status === "committed" ? "ok" : "info"}>
                      {session.status === "committed" ? "已提交" : "可继续"}
                    </StatusPill>
                    {session.status === "committed" ? <GitCommit size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    aria-label={`删除会话 ${session.title}`}
                    onClick={() => void deleteSession(session.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  );
}

function groupSessions(sessions: Session[]) {
  const groups = new Map<string, { key: string; repoFullName: string; branch: string; sessions: Session[] }>();
  for (const session of sessions) {
    const key = `${session.repoFullName}#${session.branch}`;
    const group = groups.get(key) ?? {
      key,
      repoFullName: session.repoFullName,
      branch: session.branch,
      sessions: []
    };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
