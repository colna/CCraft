import { describe, expect, it } from "vitest";
import { parseAiChangeResponse, parseDiffsFromResponse, parseUnifiedDiff } from "./diffParser";

const rawDiff = `--- a/src/UserList.tsx
+++ b/src/UserList.tsx
@@ -1,3 +1,4 @@
 import { users } from './data';
+const search = '';
-users.map(renderUser)
+users.filter((user) => user.name.includes(search)).map(renderUser)`;

describe("diffParser", () => {
  it("parses a unified diff into file changes", () => {
    const [diff] = parseUnifiedDiff(rawDiff);

    expect(diff?.filePath).toBe("src/UserList.tsx");
    expect(diff?.additions).toBe(2);
    expect(diff?.deletions).toBe(1);
    expect(diff?.hunks[0]?.header).toContain("@@");
  });

  it("extracts diff code fences from AI responses", () => {
    const diffs = parseDiffsFromResponse(`我会修改文件。\n\n\`\`\`diff\n${rawDiff}\n\`\`\``);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.selected).toBe(true);
  });

  it("parses added files", () => {
    const [diff] = parseUnifiedDiff(`diff --git a/src/NewFile.ts b/src/NewFile.ts
new file mode 100644
--- /dev/null
+++ b/src/NewFile.ts
@@ -0,0 +1,2 @@
+export const value = 1;
+export const name = 'new';`);

    expect(diff).toMatchObject({
      filePath: "src/NewFile.ts",
      type: "added",
      additions: 2,
      deletions: 0
    });
  });

  it("parses deleted files", () => {
    const [diff] = parseUnifiedDiff(`diff --git a/src/OldFile.ts b/src/OldFile.ts
deleted file mode 100644
--- a/src/OldFile.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const value = 1;
-export const name = 'old';`);

    expect(diff).toMatchObject({
      filePath: "src/OldFile.ts",
      type: "deleted",
      additions: 0,
      deletions: 2
    });
  });

  it("parses renamed files", () => {
    const [diff] = parseUnifiedDiff(`diff --git a/src/OldName.ts b/src/NewName.ts
similarity index 88%
rename from src/OldName.ts
rename to src/NewName.ts
--- a/src/OldName.ts
+++ b/src/NewName.ts
@@ -1 +1 @@
-export const name = 'old';
+export const name = 'new';`);

    expect(diff).toMatchObject({
      filePath: "src/NewName.ts",
      previousFilePath: "src/OldName.ts",
      type: "renamed",
      additions: 1,
      deletions: 1
    });
  });

  it("parses AI changeset metadata and multi-file diffs", () => {
    const result = parseAiChangeResponse(`DEVCHAT_CHANGESET
Summary: Update user list and add empty state.
Impact: Touches user list rendering and empty state copy.
Commit Message: feat: improve user list

\`\`\`diff
${rawDiff}
diff --git a/src/EmptyState.tsx b/src/EmptyState.tsx
new file mode 100644
--- /dev/null
+++ b/src/EmptyState.tsx
@@ -0,0 +1 @@
+export function EmptyState() { return null; }
\`\`\``);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;
    expect(result.summary).toContain("Update user list");
    expect(result.impact).toContain("user list");
    expect(result.commitMessage).toBe("feat: improve user list");
    expect(result.diffs).toHaveLength(2);
  });

  it("distinguishes no-diff responses", () => {
    const result = parseAiChangeResponse("NO_DIFF: 需要先选择项目。");

    expect(result).toEqual({
      status: "no_diff",
      diffs: [],
      reason: "需要先选择项目。"
    });
  });

  it("reports malformed changesets instead of fabricating diffs", () => {
    const result = parseAiChangeResponse(`DEVCHAT_CHANGESET
Summary: Missing metadata.

\`\`\`diff
not a unified diff
\`\`\``);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.diffs).toEqual([]);
    expect(result.error).toContain("no valid file diff");
  });

  it("treats header-only diffs as malformed", () => {
    const result = parseAiChangeResponse(`\`\`\`diff
--- a/src/App.tsx
+++ b/src/App.tsx
\`\`\``);

    expect(result.status).toBe("invalid");
  });

  it("returns an empty diff list for non-diff prose", () => {
    expect(parseDiffsFromResponse("我需要更多上下文。")).toEqual([]);
  });
});
