import { Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../../stores/projectStore";

export function ProjectsPage() {
  const navigate = useNavigate();
  const repos = useProjectStore((state) => state.repos);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const hasMore = useProjectStore((state) => state.hasMore);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const loadRepos = useProjectStore((state) => state.loadRepos);
  const loadMoreRepos = useProjectStore((state) => state.loadMoreRepos);
  const loadRecentProjects = useProjectStore((state) => state.loadRecentProjects);
  const selectProject = useProjectStore((state) => state.selectProject);
  const openRecentProject = useProjectStore((state) => state.openRecentProject);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "recent" | "starred">("all");

  useEffect(() => {
    if (repos.length === 0) {
      void loadRepos();
    }
  }, [loadRepos, repos.length]);

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const filteredRepos = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    const source = activeTab === "starred" ? repos.filter((repo) => repo.stars > 0) : repos;
    if (!normalized) return source;
    return source.filter((repo) => repo.fullName.toLowerCase().includes(normalized));
  }, [activeTab, debouncedQuery, repos]);

  const filteredRecentProjects = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    if (!normalized) return recentProjects;
    return recentProjects.filter((project) => project.repoFullName.toLowerCase().includes(normalized));
  }, [debouncedQuery, recentProjects]);

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
        <button type="button" className={activeTab === "all" ? "active" : ""} onClick={() => setActiveTab("all")}>全部</button>
        <button type="button" className={activeTab === "recent" ? "active" : ""} onClick={() => setActiveTab("recent")}>最近</button>
        <button type="button" className={activeTab === "starred" ? "active" : ""} onClick={() => setActiveTab("starred")}>收藏</button>
      </div>

      <div className="list-stack">
        {isLoading ? <div className="empty-state">正在加载 GitHub 仓库...</div> : null}
        {error ? <div className="empty-state warn-text">{error}</div> : null}
        {!isLoading && !error && activeTab !== "recent" && filteredRepos.length === 0 ? (
          <div className="empty-state">{debouncedQuery.trim() ? "没有匹配的仓库" : "保存 GitHub Token 后加载仓库"}</div>
        ) : null}
        {!isLoading && !error && activeTab === "recent" && filteredRecentProjects.length === 0 ? (
          <div className="empty-state">{debouncedQuery.trim() ? "没有匹配的最近项目" : "还没有最近项目"}</div>
        ) : null}
        {activeTab === "recent" ? filteredRecentProjects.map((project) => (
          <button
            key={`${project.repoId}-${project.branch}`}
            type="button"
            className="repo-card"
            onClick={async () => {
              const opened = await openRecentProject(project);
              navigate(`/chat/${opened.repoId}`);
            }}
          >
            <div>
              <h2>{project.repoName}</h2>
              <p>{project.repoFullName}</p>
              <span>{project.branch} · {new Date(project.lastAccessed).toLocaleDateString("zh-CN")}</span>
            </div>
          </button>
        )) : filteredRepos.map((repo) => (
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
        {activeTab !== "recent" && hasMore ? (
          <button className="secondary-action" type="button" onClick={loadMoreRepos} disabled={isLoading}>
            {isLoading ? "加载中" : "加载更多"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
