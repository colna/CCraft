import { describe, expect, it } from "vitest";
import type { AiConfig, Branch, FileDiff, ProjectSnapshot, UserConfig } from "./index";

describe("shared types", () => {
  it("allows project snapshots with key files and module maps", () => {
    const snapshot: ProjectSnapshot = {
      directoryTree: { src: ["main.tsx"] },
      techStack: { language: "TypeScript", framework: "React", dependencies: ["vite"] },
      keyFiles: [{ path: "src/main.tsx", role: "entry", summary: "React entry" }],
      moduleMap: { app: ["src/main.tsx"] },
      generatedAt: "2026-05-10T00:00:00.000Z"
    };

    expect(snapshot.keyFiles[0]?.path).toBe("src/main.tsx");
  });

  it("marks diffs as selectable", () => {
    const diff: FileDiff = {
      filePath: "src/App.tsx",
      type: "modified",
      hunks: [],
      additions: 1,
      deletions: 0,
      rawDiff: "",
      selected: true
    };

    expect(diff.selected).toBe(true);
  });

  it("models Claude AI configs without exposing plaintext API keys", () => {
    const config: AiConfig = {
      id: "claude-haiku",
      name: "Claude Haiku 4.5",
      provider: "claude",
      baseUrl: "http://172.245.240.135:8080",
      model: "claude-haiku-4-5-20251001",
      apiKeySecretRef: "ai.default.apiKey",
      isActive: true
    };

    expect(config.provider).toBe("claude");
    expect(config).not.toHaveProperty("apiKey");
    expect(config).not.toHaveProperty("maskedKey");
  });

  it("models non-sensitive persisted user config", () => {
    const config: UserConfig = {
      version: 1,
      aiConfigs: [
        {
          id: "default",
          name: "Claude Haiku 4.5",
          provider: "claude",
          baseUrl: "http://172.245.240.135:8080",
          model: "claude-haiku-4-5-20251001",
          apiKeySecretRef: "ai.default.apiKey",
          isActive: true
        }
      ],
      githubAuthStatus: "configured",
      preferences: {
        theme: "system",
        language: "zh-CN",
        defaultBranch: "main"
      }
    };

    expect(config.aiConfigs[0]).not.toHaveProperty("apiKey");
    expect(config.githubAuthStatus).toBe("configured");
  });

  it("models GitHub branches with commit refs", () => {
    const branch: Branch = {
      name: "feature/mobile",
      sha: "abc123",
      protected: false
    };

    expect(branch.name).toBe("feature/mobile");
  });
});
