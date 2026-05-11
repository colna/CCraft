import { describe, expect, it } from "vitest";
import type { FileDiff, RepositoryFileContent } from "@devchat/types";
import { parseUnifiedDiff } from "./diffParser";
import { applyDiffToFileChange, buildFileChangesFromDiffs } from "./patchApply";

describe("patchApply", () => {
  it("applies modified file patches to original content", () => {
    const diff = oneDiff(`--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,3 +1,3 @@
 export function App() {
-  return 'old';
+  return 'new';
 }
`);

    const change = applyDiffToFileChange(diff, "export function App() {\n  return 'old';\n}\n");

    expect(change).toMatchObject({
      path: "src/App.tsx",
      changeType: "modified",
      content: "export function App() {\n  return 'new';\n}\n"
    });
  });

  it("applies added file patches without loading original content", async () => {
    const diff = oneDiff(`diff --git a/src/New.ts b/src/New.ts
new file mode 100644
--- /dev/null
+++ b/src/New.ts
@@ -0,0 +1 @@
+export const value = 1;
`);

    const changes = await buildFileChangesFromDiffs([diff], async () => {
      throw new Error("added files should not load original content");
    });

    expect(changes).toEqual([
      {
        path: "src/New.ts",
        content: "export const value = 1;",
        changeType: "added"
      }
    ]);
  });

  it("generates empty content for deleted files after verifying context", async () => {
    const diff = oneDiff(`diff --git a/src/Old.ts b/src/Old.ts
deleted file mode 100644
--- a/src/Old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const value = 1;
`);

    const changes = await buildFileChangesFromDiffs([diff], fakeLoader({ "src/Old.ts": "export const value = 1;\n" }));

    expect(changes[0]).toMatchObject({
      path: "src/Old.ts",
      content: "",
      changeType: "deleted"
    });
  });

  it("keeps previous path for renamed files", async () => {
    const diff = oneDiff(`diff --git a/src/Old.ts b/src/New.ts
rename from src/Old.ts
rename to src/New.ts
--- a/src/Old.ts
+++ b/src/New.ts
@@ -1 +1 @@
-export const name = 'old';
+export const name = 'new';
`);

    const changes = await buildFileChangesFromDiffs([diff], fakeLoader({ "src/Old.ts": "export const name = 'old';\n" }));

    expect(changes[0]).toMatchObject({
      path: "src/New.ts",
      previousPath: "src/Old.ts",
      content: "export const name = 'new';\n",
      changeType: "renamed"
    });
  });

  it("rejects context mismatches", () => {
    const diff = oneDiff(`--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old
+new
`);

    expect(() => applyDiffToFileChange(diff, "different\n")).toThrow("Patch 上下文不匹配");
  });

  it("rejects skipped or binary file content", async () => {
    const diff = oneDiff(`--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old
+new
`);

    await expect(buildFileChangesFromDiffs([diff], async () => ({
      path: "src/App.tsx",
      sha: "abc",
      size: 10,
      skippedReason: "binary"
    }))).rejects.toThrow("binary");
  });

  it("rejects binary patches", async () => {
    const diff: FileDiff = {
      filePath: "image.png",
      type: "modified",
      hunks: [],
      additions: 0,
      deletions: 0,
      rawDiff: "Binary files a/image.png and b/image.png differ",
      selected: true
    };

    await expect(buildFileChangesFromDiffs([diff], fakeLoader({}))).rejects.toThrow("二进制 patch");
  });
});

function oneDiff(rawDiff: string): FileDiff {
  const [diff] = parseUnifiedDiff(rawDiff);
  if (!diff) {
    throw new Error("test diff did not parse");
  }
  return diff;
}

function fakeLoader(files: Record<string, string>) {
  return async (path: string): Promise<RepositoryFileContent> => {
    const content = files[path];
    return {
      path,
      sha: "abc123",
      size: content?.length ?? 0,
      ...(content === undefined ? {} : { content })
    };
  };
}
