import { describe, expect, it } from "vitest";
import { parseDiffsFromResponse, parseUnifiedDiff } from "./diffParser";

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
});
