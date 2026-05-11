import { Rocket } from "lucide-react";
import { useState } from "react";
import { BranchSelector } from "../../components/BranchSelector";
import { useChatStore } from "../../stores/chatStore";
import { invokeCommand } from "../../lib/tauri";
import { GITHUB_TOKEN_SECRET_REF, useProjectStore } from "../../stores/projectStore";
import { buildFileChangesFromDiffs } from "../../lib/patchApply";
import type { RepositoryFileContent } from "@devchat/types";

export function CommitPage() {
  const diffs = useChatStore((state) => state.pendingDiffs);
  const currentProject = useProjectStore((state) => state.currentProject);
  const refreshCurrentBranch = useProjectStore((state) => state.refreshCurrentBranch);
  const [message, setMessage] = useState("feat: add search functionality");
  const [status, setStatus] = useState<string | null>(null);

  async function commit() {
    if (!currentProject) {
      setStatus("请先选择项目");
      return;
    }

    setStatus("正在提交...");
    try {
      const branchIsFresh = await refreshCurrentBranch();
      if (!branchIsFresh) {
        setStatus("远程分支已变化，请刷新项目上下文后再提交");
        return;
      }

      const selectedDiffs = diffs.filter((diff) => diff.selected);
      if (selectedDiffs.length === 0) {
        setStatus("请选择至少一个文件变更");
        return;
      }

      const changes = await buildFileChangesFromDiffs(selectedDiffs, (path) =>
        invokeCommand<RepositoryFileContent>("github_get_file_content", {
          tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
          owner: currentProject.repoOwner,
          repo: currentProject.repoName,
          branch: currentProject.branch,
          path
        })
      );
      const result = await invokeCommand<{ sha: string }>("github_commit_and_push", {
        tokenSecretRef: GITHUB_TOKEN_SECRET_REF,
        owner: currentProject.repoOwner,
        repo: currentProject.repoName,
        branch: currentProject.branch,
        changes,
        message
      });
      setStatus(`提交成功 ${result.sha}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "提交失败");
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1>提交确认</h1>
        <p>选择文件，编辑 Commit Message，然后推送到远程。</p>
      </header>

      <BranchSelector />

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
