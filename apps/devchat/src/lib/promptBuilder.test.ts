import { describe, expect, it } from "vitest";
import type { Message, Project } from "@devchat/types";
import { buildChatMessages, buildSystemPrompt, redactSensitiveText } from "./promptBuilder";

const project: Project = {
  repoId: "repo-1",
  repoOwner: "octo",
  repoName: "devchat",
  repoFullName: "octo/devchat",
  branch: "feature/real-ai",
  branchSha: "abc123",
  lastAccessed: "2026-05-11T00:00:00.000Z",
  snapshot: {
    directoryTree: {
      src: {
        "App.tsx": "file",
        stores: {
          "chatStore.ts": "file"
        }
      }
    },
    techStack: {
      language: "TypeScript",
      framework: "React",
      dependencies: ["zustand", "vite", "tauri"]
    },
    keyFiles: [
      {
        path: "src/stores/chatStore.ts",
        role: "chat state",
        summary: "发送真实 AI streaming 请求"
      },
      {
        path: "src/lib/promptBuilder.ts",
        role: "prompt builder",
        summary: "secret: should-not-appear"
      }
    ],
    moduleMap: {
      state: ["src/stores/chatStore.ts"],
      prompt: ["src/lib/promptBuilder.ts"]
    },
    skippedFiles: [{ path: "large.log", reason: "too_large" }],
    generatedAt: "2026-05-11T00:00:00.000Z"
  }
};

describe("promptBuilder", () => {
  it("builds a project-aware system prompt with path-labelled file references", () => {
    const prompt = buildSystemPrompt({
      project,
      history: [
        message("user", "帮我修复聊天页"),
        message("assistant", "我会先看 chatStore。")
      ]
    });

    expect(prompt).toContain("octo/devchat");
    expect(prompt).toContain("feature/real-ai");
    expect(prompt).toContain("path=src/stores/chatStore.ts");
    expect(prompt).toContain("role=chat state");
    expect(prompt).toContain("最近对话");
    expect(prompt).toContain("unified diff");
  });

  it("redacts API keys and tokens before adding context to prompts", () => {
    const prompt = buildSystemPrompt({
      project,
      history: [
        message("user", "apiKey = sk-test-abcdefghijklmnopqrstuvwxyz123456"),
        message("assistant", "token: ghp_abcdefghijklmnopqrstuvwxyz1234567890")
      ]
    });

    expect(prompt).not.toContain("sk-test-abcdefghijklmnopqrstuvwxyz123456");
    expect(prompt).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(prompt).not.toContain("should-not-appear");
    expect(prompt).toContain("[REDACTED_SECRET]");
  });

  it("deterministically trims oversized snapshot and history context", () => {
    const longProject: Project = {
      ...project,
      snapshot: {
        ...project.snapshot!,
        techStack: {
          ...project.snapshot!.techStack,
          dependencies: Array.from({ length: 80 }, (_, index) => `dependency-${index}`)
        },
        keyFiles: Array.from({ length: 80 }, (_, index) => ({
          path: `src/generated/file-${index}.ts`,
          role: "generated",
          summary: "x".repeat(80)
        }))
      }
    };
    const history = Array.from({ length: 20 }, (_, index) => message(index % 2 === 0 ? "user" : "assistant", `message-${index} ${"y".repeat(120)}`));

    const first = buildSystemPrompt({ project: longProject, history, maxChars: 900 });
    const second = buildSystemPrompt({ project: longProject, history, maxChars: 900 });

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(900);
    expect(first).toContain("[context-truncated]");
    expect(first).toContain("输出要求");
  });

  it("trims chat messages from the oldest side while preserving the latest user request", () => {
    const messages = [
      message("user", `old ${"a".repeat(120)}`),
      message("assistant", `middle ${"b".repeat(120)}`),
      message("user", `latest ${"c".repeat(120)}`)
    ];

    const commandMessages = buildChatMessages(messages, 90);

    expect(commandMessages).toHaveLength(1);
    expect(commandMessages[0]).toMatchObject({ role: "user" });
    expect(commandMessages[0]?.content).toContain("latest");
    expect(commandMessages[0]?.content.length).toBeLessThanOrEqual(85);
  });

  it("redacts sensitive text directly", () => {
    expect(redactSensitiveText("password: hunter2")).toBe("password=[REDACTED_SECRET]");
  });
});

function message(role: Message["role"], content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: "2026-05-11T00:00:00.000Z"
  };
}
