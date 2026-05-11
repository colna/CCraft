import type { FileDiff, RepositoryFileContent } from "@devchat/types";

export type FileChange = {
  path: string;
  previousPath?: string;
  content: string;
  changeType: FileDiff["type"];
};

type LoadFileContent = (path: string) => Promise<RepositoryFileContent>;

export async function buildFileChangesFromDiffs(
  diffs: FileDiff[],
  loadFileContent: LoadFileContent
): Promise<FileChange[]> {
  const changes: FileChange[] = [];

  for (const diff of diffs.filter((diff) => diff.selected)) {
    if (isBinaryPatch(diff)) {
      throw new Error(`不支持二进制 patch：${diff.filePath}`);
    }

    const originalPath = diff.previousFilePath ?? diff.filePath;
    const originalContent = diff.type === "added" ? "" : await loadTextContent(loadFileContent, originalPath);
    changes.push(applyDiffToFileChange(diff, originalContent));
  }

  return changes;
}

export function applyDiffToFileChange(diff: FileDiff, originalContent: string): FileChange {
  if (diff.type !== "added" && diff.type !== "renamed" && originalContent.length === 0 && diff.type !== "deleted") {
    throw new Error(`缺少原文件内容：${diff.filePath}`);
  }

  const patchedContent = applyUnifiedDiff(diff, originalContent);
  const content = diff.type === "deleted" ? "" : patchedContent;
  return {
    path: diff.filePath,
    ...(diff.previousFilePath ? { previousPath: diff.previousFilePath } : {}),
    content,
    changeType: diff.type
  };
}

function applyUnifiedDiff(diff: FileDiff, originalContent: string): string {
  const original = splitContent(originalContent);
  const output: string[] = [];
  let sourceIndex = 0;

  for (const hunk of diff.hunks) {
    const header = parseHunkHeader(hunk.header);
    const hunkStart = Math.max(0, header.oldStart - 1);

    while (sourceIndex < hunkStart) {
      output.push(original.lines[sourceIndex] ?? "");
      sourceIndex += 1;
    }

    for (const line of hunk.lines) {
      if (line.startsWith("\\ No newline")) {
        continue;
      }

      const marker = line[0];
      const value = line.slice(1);
      if (marker === " ") {
        assertSourceLine(original.lines, sourceIndex, value, diff.filePath);
        output.push(value);
        sourceIndex += 1;
      } else if (marker === "-") {
        assertSourceLine(original.lines, sourceIndex, value, diff.filePath);
        sourceIndex += 1;
      } else if (marker === "+") {
        output.push(value);
      } else {
        throw new Error(`不支持的 patch 行：${diff.filePath}`);
      }
    }
  }

  while (sourceIndex < original.lines.length) {
    output.push(original.lines[sourceIndex] ?? "");
    sourceIndex += 1;
  }

  return joinContent(output, original.trailingNewline);
}

function loadTextContent(loadFileContent: LoadFileContent, path: string): Promise<string> {
  return loadFileContent(path).then((file) => {
    if (file.skippedReason) {
      throw new Error(`无法读取 ${path}：${file.skippedReason}`);
    }
    if (typeof file.content !== "string") {
      throw new Error(`无法读取 ${path}：缺少文本内容`);
    }
    return file.content;
  });
}

function parseHunkHeader(header: string): { oldStart: number } {
  const match = header.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  if (!match?.[1]) {
    throw new Error(`无法解析 hunk header：${header}`);
  }
  return { oldStart: Number.parseInt(match[1], 10) };
}

function assertSourceLine(lines: string[], index: number, expected: string, path: string): void {
  const actual = lines[index];
  if (actual !== expected) {
    throw new Error(`Patch 上下文不匹配：${path}`);
  }
}

function splitContent(content: string): { lines: string[]; trailingNewline: boolean } {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.length === 0) {
    return { lines: [], trailingNewline: false };
  }

  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (trailingNewline) {
    lines.pop();
  }
  return { lines, trailingNewline };
}

function joinContent(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) {
    return "";
  }
  return `${lines.join("\n")}${trailingNewline ? "\n" : ""}`;
}

function isBinaryPatch(diff: FileDiff): boolean {
  return /Binary files .* differ|GIT binary patch/.test(diff.rawDiff);
}
