import { Check, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useChatStore } from "../../stores/chatStore";

export function DiffViewPage() {
  const diffs = useChatStore((state) => state.pendingDiffs);
  const toggleDiff = useChatStore((state) => state.toggleDiff);

  return (
    <section className="page-stack">
      <header className="toolbar-header">
        <Link to="/" className="icon-link" aria-label="返回">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1>变更详情</h1>
          <p>修改文件 ({diffs.length})</p>
        </div>
      </header>

      <div className="file-picker">
        {diffs.map((diff) => (
          <button key={diff.filePath} type="button" onClick={() => toggleDiff(diff.filePath)}>
            <span className={diff.selected ? "checkbox checked" : "checkbox"}>{diff.selected ? <Check size={12} /> : null}</span>
            <span>{diff.filePath}</span>
            <small>+{diff.additions} -{diff.deletions}</small>
          </button>
        ))}
      </div>

      {diffs.map((diff) => (
        <article className="diff-viewer" key={diff.filePath}>
          <h2>{diff.filePath}</h2>
          <pre>
            {diff.hunks.flatMap((hunk) => [hunk.header, ...hunk.lines]).join("\n")}
          </pre>
        </article>
      ))}

      <Link to="/commit" className="primary-action">提交变更</Link>
    </section>
  );
}
