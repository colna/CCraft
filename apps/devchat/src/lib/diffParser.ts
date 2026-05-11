import type { DiffHunk, FileDiff } from "@devchat/types";

export type AiChangeParseResult =
  | {
      status: "parsed";
      diffs: FileDiff[];
      summary: string | undefined;
      impact: string | undefined;
      commitMessage: string | undefined;
    }
  | { status: "no_diff"; diffs: []; reason: string | undefined }
  | { status: "invalid"; diffs: []; error: string };

export function parseDiffsFromResponse(response: string): FileDiff[] {
  const result = parseAiChangeResponse(response);
  return result.status === "parsed" ? result.diffs : [];
}

export function parseAiChangeResponse(response: string): AiChangeParseResult {
  const blocks = extractDiffBlocks(response);
  if (blocks.length === 0) {
    return { status: "no_diff", diffs: [], reason: extractNoDiffReason(response) };
  }

  const diffs = blocks.flatMap(parseUnifiedDiff);
  if (diffs.length === 0) {
    return { status: "invalid", diffs: [], error: "AI output contained a diff block, but no valid file diff was found" };
  }

  const hasContractMarker = /\bDEVCHAT_CHANGESET\b/.test(response);
  const summary = extractLineSection(response, ["Summary", "变更说明"]);
  const impact = extractLineSection(response, ["Impact", "影响范围"]);
  const commitMessage = extractLineSection(response, ["Commit Message", "Commit", "提交信息"]);
  if (hasContractMarker && (!summary || !impact || !commitMessage)) {
    return {
      status: "invalid",
      diffs: [],
      error: "AI output used DEVCHAT_CHANGESET but missed Summary, Impact or Commit Message"
    };
  }

  return { status: "parsed", diffs, summary, impact, commitMessage };
}

export function parseUnifiedDiff(rawDiff: string): FileDiff[] {
  const normalized = rawDiff.trim();
  if (!normalized) return [];

  const fileStarts = normalized.includes("diff --git")
    ? normalized.split(/\n(?=diff --git\s+a\/)/g)
    : normalized.split(/\n(?=---\s+(?:a\/|\/dev\/null))/g);
  return fileStarts.map(parseSingleDiff).filter((diff): diff is FileDiff => Boolean(diff));
}

function parseSingleDiff(content: string): FileDiff | null {
  const lines = content.split("\n");
  const oldPath = parseDiffPath(lines.find((line) => line.startsWith("--- ")), "--- ");
  const newPath = parseDiffPath(lines.find((line) => line.startsWith("+++ ")), "+++ ");
  const renameFrom = parseRenamePath(lines.find((line) => line.startsWith("rename from ")), "rename from ");
  const renameTo = parseRenamePath(lines.find((line) => line.startsWith("rename to ")), "rename to ");
  const filePath = newPath ?? renameTo ?? oldPath;
  if (!filePath) return null;
  const previousFilePath = renameFrom ?? (oldPath && oldPath !== filePath ? oldPath : undefined);

  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    if (current && !line.startsWith("---") && !line.startsWith("+++")) current.lines.push(line);
  }

  if (hunks.length === 0 && (!previousFilePath || previousFilePath === filePath)) {
    return null;
  }

  return {
    filePath,
    ...(previousFilePath && previousFilePath !== filePath ? { previousFilePath } : {}),
    type: resolveDiffType({ oldPath, newPath, previousFilePath, filePath, additions, deletions }),
    hunks,
    additions,
    deletions,
    rawDiff: content,
    selected: true
  };
}

function extractDiffBlocks(response: string): string[] {
  return [...response.matchAll(/```diff\s*\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
}

function extractNoDiffReason(response: string): string | undefined {
  return response.match(/\bNO_DIFF:\s*(.+)/i)?.[1]?.trim();
}

function extractLineSection(response: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = response.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, "im"));
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

function parseDiffPath(line: string | undefined, prefix: string): string | undefined {
  if (!line?.startsWith(prefix)) return undefined;
  const rawPath = line.slice(prefix.length).trim().split(/\s+/)[0];
  if (!rawPath || rawPath === "/dev/null") return undefined;
  return rawPath.replace(/^[ab]\//, "");
}

function parseRenamePath(line: string | undefined, prefix: string): string | undefined {
  if (!line?.startsWith(prefix)) return undefined;
  const path = line.slice(prefix.length).trim();
  return path || undefined;
}

function resolveDiffType(input: {
  oldPath: string | undefined;
  newPath: string | undefined;
  previousFilePath: string | undefined;
  filePath: string;
  additions: number;
  deletions: number;
}): FileDiff["type"] {
  if (input.previousFilePath && input.previousFilePath !== input.filePath) return "renamed";
  if (!input.oldPath && input.newPath) return "added";
  if (input.oldPath && !input.newPath) return "deleted";
  if (input.additions > 0 && input.deletions === 0 && !input.oldPath) return "added";
  if (input.deletions > 0 && input.additions === 0 && !input.newPath) return "deleted";
  return "modified";
}
