import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusPill } from "../../components/StatusPill";
import { useProjectStore } from "../../stores/projectStore";

export function HomePage() {
  const currentProject = useProjectStore((state) => state.currentProject);

  return (
    <section className="page-stack">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">DevChat</p>
          <h1>手机里的 AI 编程工作台</h1>
          <p>选择 GitHub 仓库，加载项目快照，通过对话生成 Diff，确认后提交。</p>
        </div>
        <Sparkles className="hero-icon" size={36} aria-hidden="true" />
      </header>

      <section className="section-block">
        <div className="section-heading">
          <h2>最近项目</h2>
          <StatusPill tone={currentProject?.snapshot ? "ok" : "info"}>
            {currentProject?.snapshot ? "快照已缓存" : "等待选择"}
          </StatusPill>
        </div>
        {currentProject ? (
          <Link className="project-card" to={`/chat/${currentProject.repoId}`}>
            <div>
              <span className="card-kicker">{currentProject.branch}</span>
              <h3>{currentProject.repoName}</h3>
              <p>{currentProject.snapshot?.techStack.framework ?? "等待分析"}</p>
            </div>
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <div className="empty-state">还没有最近项目</div>
        )}
      </section>

      <section className="quick-grid" aria-label="快捷入口">
        <Link to="/projects" className="quick-action">
          <Clock size={18} aria-hidden="true" />
          <span>选择新项目</span>
        </Link>
        <Link to="/settings" className="quick-action">
          <Sparkles size={18} aria-hidden="true" />
          <span>配置 AI 模型</span>
        </Link>
      </section>
    </section>
  );
}
