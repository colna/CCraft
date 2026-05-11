import { Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../../stores/projectStore";

export function ProjectsPage() {
  const navigate = useNavigate();
  const repos = useProjectStore((state) => state.repos);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const loadRepos = useProjectStore((state) => state.loadRepos);
  const selectProject = useProjectStore((state) => state.selectProject);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (repos.length === 0) {
      void loadRepos();
    }
  }, [loadRepos, repos.length]);

  const filteredRepos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(normalized));
  }, [query, repos]);

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1>选择项目</h1>
        <p>从 GitHub 仓库开始一次对话式开发。</p>
      </header>

      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索仓库..."
          aria-label="搜索仓库"
        />
      </label>

      <div className="segmented-control" role="tablist" aria-label="仓库筛选">
        <button type="button" className="active">全部</button>
        <button type="button">最近</button>
        <button type="button">收藏</button>
      </div>

      <div className="list-stack">
        {isLoading ? <div className="empty-state">正在加载 GitHub 仓库...</div> : null}
        {error ? <div className="empty-state warn-text">{error}</div> : null}
        {!isLoading && !error && filteredRepos.length === 0 ? (
          <div className="empty-state">{query.trim() ? "没有匹配的仓库" : "保存 GitHub Token 后加载仓库"}</div>
        ) : null}
        {filteredRepos.map((repo) => (
          <button
            key={repo.id}
            type="button"
            className="repo-card"
            onClick={async () => {
              try {
                const project = await selectProject(repo);
                navigate(`/chat/${project.repoId}`);
              } catch {
                // Store error state is rendered above.
              }
            }}
          >
            <div>
              <h2>{repo.name}</h2>
              <p>{repo.fullName}</p>
              <span>{repo.language ?? "Unknown"} · {new Date(repo.updatedAt).toLocaleDateString("zh-CN")}</span>
            </div>
            <span className="star-count">
              <Star size={14} aria-hidden="true" />
              {repo.stars}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
