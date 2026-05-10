import { demoDiff, demoProject, demoRepos } from "./mockData";

type CommandArgs = Record<string, unknown>;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function invokeCommand<T>(command: string, args: CommandArgs = {}): Promise<T> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }

  await delay(180);

  switch (command) {
    case "save_secret":
      return undefined as T;
    case "test_ai_connection":
      return { ok: args.provider === "claude" && Boolean(args.baseUrl && args.model && args.apiKeySecretRef) } as T;
    case "github_list_repos":
      return demoRepos as T;
    case "generate_snapshot":
      return demoProject.snapshot as T;
    case "github_commit_and_push":
      return { sha: "demo1234", htmlUrl: "https://github.com/colna/my-app/commit/demo1234" } as T;
    case "mock_diff":
      return [demoDiff] as T;
    default:
      throw new Error(`Unknown command in web preview: ${command}`);
  }
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
