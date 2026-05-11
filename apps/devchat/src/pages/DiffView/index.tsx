import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BranchSelector } from "../../components/BranchSelector";
import { useChatStore } from "../../stores/chatStore";

const MAX_RENDERED_DIFF_LINES = 400;

export function DiffViewPage() {
  const diffs = useChatStore((state) => state.pendingDiffs);
  const toggleDiff = useChatStore((state) => state.toggleDiff);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const toggleCollapsed = (filePath: string) => {
    setCollapsedFiles((files) => {
      const next = new Set(files);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

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

      <BranchSelector />

      <div className="file-picker">
        {diffs.map((diff) => (
          <button key={diff.filePath} type="button" onClick={() => toggleDiff(diff.filePath)}>
            <span className={diff.selected ? "checkbox checked" : "checkbox"}>{diff.selected ? <Check size={12} /> : null}</span>
            <span>{diff.previousFilePath ? `${diff.previousFilePath} → ${diff.filePath}` : diff.filePath}</span>
            <small>+{diff.additions} -{diff.deletions}</small>
          </button>
        ))}
      </div>

      {diffs.map((diff) => {
        const lines = diff.hunks.flatMap((hunk) => [hunk.header, ...hunk.lines]);
        const renderedLines = lines.slice(0, MAX_RENDERED_DIFF_LINES);
        const collapsed = collapsedFiles.has(diff.filePath);

        return (
          <article className="diff-viewer" key={diff.filePath}>
            <h2>
              <button type="button" onClick={() => toggleCollapsed(diff.filePath)} aria-label={collapsed ? "展开文件 diff" : "折叠文件 diff"}>
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <span>{diff.previousFilePath ? `${diff.previousFilePath} → ${diff.filePath}` : diff.filePath}</span>
            </h2>
            {collapsed ? null : (
              <>
                <pre>{renderedLines.join("\n")}</pre>
                {lines.length > MAX_RENDERED_DIFF_LINES ? (
                  <p className="diff-truncated">仅显示前 {MAX_RENDERED_DIFF_LINES} 行，共 {lines.length} 行。</p>
                ) : null}
              </>
            )}
          </article>
        );
      })}

      <Link to="/commit" className="primary-action">提交变更</Link>
    </section>
  );
}
