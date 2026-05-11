import { Rocket } from "lucide-react";
import { useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { invokeCommand } from "../../lib/tauri";
import { GITHUB_TOKEN_SECRET_REF, useProjectStore } from "../../stores/projectStore";

export function CommitPage() {
  const diffs = useChatStore((state) => state.pendingDiffs);
  const currentProject = useProjectStore((state) => state.currentProject);
  const [message, setMessage] = useState("feat: add search functionality");
  const [status, setStatus] = useState<string | null>(null);

  async function commit() {
    if (!currentProject) {
      setStatus("请先选择项目");
      return;
    }

    setStatus("正在提交...");
    const result = await invokeCommand<{ sha: string }>("github_commit_and_push", {
      tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
      owner: currentProject.repoOwner,
      repo: currentProject.repoName,
      branch: currentProject.branch,
      changes: diffs.filter((diff) => diff.selected).map((diff) => ({
        path: diff.filePath,
        content: diff.rawDiff,
        changeType: diff.type
      })),
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
        <select defaultValue={currentProject?.branch ?? "main"} aria-label="分支" disabled>
          <option value={currentProject?.branch ?? "main"}>{currentProject?.branch ?? "main"}</option>
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
