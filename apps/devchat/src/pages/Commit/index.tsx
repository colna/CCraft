import { Rocket } from "lucide-react";
import { useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { invokeCommand } from "../../lib/tauri";

export function CommitPage() {
  const diffs = useChatStore((state) => state.pendingDiffs);
  const [message, setMessage] = useState("feat: add search functionality");
  const [status, setStatus] = useState<string | null>(null);

  async function commit() {
    setStatus("正在提交...");
    const result = await invokeCommand<{ sha: string }>("github_commit_and_push", {
      branch: "main",
      changes: diffs.filter((diff) => diff.selected),
      message
    });
    setStatus(`提交成功 ${result.sha}`);
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1>提交确认</h1>
        <p>选择文件，编辑 Commit Message，然后推送到远程。</p>
      </header>

      <label className="field-block">
        <span>分支</span>
        <select defaultValue="main" aria-label="分支">
          <option value="main">main</option>
          <option value="develop">develop</option>
        </select>
      </label>

      <label className="field-block">
        <span>Commit Message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} />
      </label>

      <div className="section-block">
        <h2>修改文件</h2>
        {diffs.map((diff) => (
          <p key={diff.filePath}>{diff.selected ? "☑" : "☐"} {diff.filePath} (+{diff.additions}-{diff.deletions})</p>
        ))}
      </div>

      <button type="button" className="primary-action" onClick={commit}>
        <Rocket size={18} aria-hidden="true" />
        Commit & Push
      </button>
      {status ? <p className="status-text">{status}</p> : null}
    </section>
  );
}
