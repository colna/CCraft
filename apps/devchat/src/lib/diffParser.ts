import type { DiffHunk, FileDiff } from "@devchat/types";

export function parseDiffsFromResponse(response: string): FileDiff[] {
  const blocks = [...response.matchAll(/```diff\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
  return blocks.map(parseUnifiedDiff).flat();
}

export function parseUnifiedDiff(rawDiff: string): FileDiff[] {
  const normalized = rawDiff.trim();
  if (!normalized) return [];

  const fileStarts = normalized.split(/\n(?=---\s+a\/)/g);
  return fileStarts.map(parseSingleDiff).filter((diff): diff is FileDiff => Boolean(diff));
}

function parseSingleDiff(content: string): FileDiff | null {
  const lines = content.split("\n");
  const oldPath = lines.find((line) => line.startsWith("--- a/"))?.replace("--- a/", "");
  const newPath = lines.find((line) => line.startsWith("+++ b/"))?.replace("+++ b/", "");
  const filePath = newPath ?? oldPath;
  if (!filePath) return null;

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

  return {
    filePath,
    type: additions > 0 && deletions === 0 ? "added" : deletions > 0 && additions === 0 ? "deleted" : "modified",
    hunks,
    additions,
    deletions,
    rawDiff: content,
    selected: true
  };
}
