type CommandArgs = Record<string, unknown>;
type UnlistenFn = () => void;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function invokeCommand<T>(command: string, args: CommandArgs = {}): Promise<T> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }

  await delay(180);

  switch (command) {
    case "save_secret":
    case "has_secret":
    case "delete_secret":
    case "test_ai_connection":
    case "chat_stream":
    case "load_user_config":
    case "save_ai_config":
    case "set_active_ai_config":
    case "delete_ai_config":
    case "update_user_preferences":
    case "github_list_repos":
    case "generate_snapshot":
    case "github_commit_and_push":
      throw new Error("真实功能需要在 Tauri App 运行时中使用");
    default:
      throw new Error(`Unknown command in web preview: ${command}`);
  }
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export async function listenCommandEvent<T>(
  eventName: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(eventName, (event) => handler(event.payload));
}
