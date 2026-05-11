import { GitBranch } from "lucide-react";
import { useEffect } from "react";
import { useProjectStore } from "../stores/projectStore";

type BranchSelectorProps = {
  variant?: "block" | "compact";
};

export function BranchSelector({ variant = "block" }: BranchSelectorProps) {
  const currentProject = useProjectStore((state) => state.currentProject);
  const branches = useProjectStore((state) => state.branches);
  const error = useProjectStore((state) => state.error);
  const loadBranches = useProjectStore((state) => state.loadBranches);
  const setProjectBranch = useProjectStore((state) => state.setProjectBranch);
  const branchOptions = branches.length > 0 || !currentProject
    ? branches
    : [{ name: currentProject.branch, sha: currentProject.branchSha ?? "", protected: false }];

  useEffect(() => {
    if (currentProject) {
      void loadBranches();
    }
  }, [currentProject?.repoId, currentProject?.repoName, loadBranches]);

  return (
    <label className={`field-block branch-selector branch-selector-${variant}`}>
      <span>
        <GitBranch size={14} aria-hidden="true" />
        目标分支
      </span>
      <select
        value={currentProject?.branch ?? ""}
        aria-label="目标分支"
        onChange={(event) => setProjectBranch(event.target.value)}
        disabled={!currentProject || branches.length === 0}
      >
        {currentProject ? null : <option value="">未选择项目</option>}
        {branchOptions.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name}{branch.protected ? " · 受保护" : ""}
          </option>
        ))}
      </select>
      {error ? <small className="helper-text warn-text">{error}</small> : null}
    </label>
  );
}
