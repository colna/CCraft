import type { Message, Project } from "@devchat/types";

const DEFAULT_SYSTEM_PROMPT_MAX_CHARS = 12_000;
const DEFAULT_CHAT_HISTORY_MAX_CHARS = 16_000;
const HISTORY_PREVIEW_MAX_MESSAGES = 6;
const HISTORY_PREVIEW_MESSAGE_MAX_CHARS = 360;
const CHAT_MESSAGE_MAX_CHARS = 4_000;
const TRUNCATED_MARKER = "...[truncated]";
const CONTEXT_TRUNCATED_MARKER = "[context-truncated]";

export type ChatPromptMessage = {
  role: "user" | "assistant";
  content: string;
};

type PromptHistoryMessage = Pick<Message, "role" | "content">;

interface BuildSystemPromptOptions {
  project?: Project | null;
  history?: PromptHistoryMessage[];
  maxChars?: number;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const { project = null, history = [], maxChars = DEFAULT_SYSTEM_PROMPT_MAX_CHARS } = options;
  const lines = [
    "你是 DevChat 的代码协作助手。基于真实项目上下文回答；不要编造文件内容、分支状态或执行结果。",
    "输出要求：先给结论和影响范围；需要改代码时给出可审查的 unified diff；无法确认时说明缺少哪些真实上下文。",
    "代码变更格式：有变更时必须包含 DEVCHAT_CHANGESET、Summary、Impact、Commit Message 和一个 diff 代码块；无变更时写 NO_DIFF: 原因。",
    "安全要求：不要在回复或 diff 中复述 API key、GitHub token、password 或 secret。"
  ];

  if (!project) {
    lines.push("当前项目：未选择。");
    return fitLinesToBudget(lines, maxChars);
  }

  lines.push("当前项目：");
  lines.push(`- 仓库：${project.repoFullName}`);
  lines.push(`- 分支：${project.branch}`);
  if (project.branchSha) {
    lines.push(`- 分支 ref：${project.branchSha}`);
  }

  if (project.snapshot) {
    const snapshot = project.snapshot;
    lines.push("项目快照：");
    lines.push(`- 生成时间：${snapshot.generatedAt}`);
    lines.push(`- 技术栈：${snapshot.techStack.language} / ${snapshot.techStack.framework}`);
    pushList(lines, "依赖", snapshot.techStack.dependencies, 18, (dependency) => dependency);
    pushList(lines, "文件引用", snapshot.keyFiles, 18, (file) => {
      return `path=${file.path}; role=${file.role}; summary=${file.summary}`;
    });
    pushList(
      lines,
      "模块边界",
      Object.entries(snapshot.moduleMap).sort(([left], [right]) => left.localeCompare(right)),
      12,
      ([name, paths]) => `${name}: ${paths.join(", ")}`
    );
    pushList(lines, "跳过文件", snapshot.skippedFiles, 12, (file) => `${file.path}: ${file.reason}`);

    const directoryTree = stableStringify(snapshot.directoryTree);
    if (directoryTree !== "{}") {
      lines.push("目录树（裁剪）：");
      lines.push(clipText(directoryTree, 2_000));
    }
  } else {
    lines.push("项目快照：未生成。");
  }

  const historyPreview = buildHistoryPreview(history);
  if (historyPreview.length > 0) {
    lines.push("最近对话（裁剪）：");
    lines.push(...historyPreview);
  }

  return fitLinesToBudget(lines, maxChars);
}

export function buildChatMessages(
  messages: PromptHistoryMessage[],
  maxChars = DEFAULT_CHAT_HISTORY_MAX_CHARS
): ChatPromptMessage[] {
  const candidates = messages.flatMap((message): ChatPromptMessage[] => {
    if ((message.role === "user" || message.role === "assistant") && message.content.trim()) {
      return [
        {
          role: message.role,
          content: clipText(redactSensitiveText(message.content.trim()), CHAT_MESSAGE_MAX_CHARS)
        }
      ];
    }

    return [];
  });
  const selected: ChatPromptMessage[] = [];
  let usedChars = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]!;
    const cost = message.role.length + message.content.length + 1;
    if (selected.length === 0 && cost > maxChars) {
      selected.unshift({
        ...message,
        content: clipText(message.content, Math.max(1, maxChars - message.role.length - 1))
      });
      break;
    }

    if (usedChars + cost > maxChars) {
      break;
    }

    selected.unshift(message);
    usedChars += cost;
  }

  return selected;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_SECRET]")
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b(api[_ -]?key|token|secret|password)\s*[:=]\s*['"]?[^'"\s]+['"]?/gi, "$1=[REDACTED_SECRET]");
}

function buildHistoryPreview(history: PromptHistoryMessage[]): string[] {
  return history
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-HISTORY_PREVIEW_MAX_MESSAGES)
    .map((message) => {
      const label = message.role === "user" ? "user" : "assistant";
      const content = clipText(redactSensitiveText(message.content.trim()).replace(/\s+/g, " "), HISTORY_PREVIEW_MESSAGE_MAX_CHARS);
      return `- ${label}: ${content}`;
    });
}

function pushList<T>(
  lines: string[],
  title: string,
  items: T[],
  limit: number,
  formatItem: (item: T) => string
): void {
  if (items.length === 0) {
    return;
  }

  lines.push(`${title}：`);
  for (const item of items.slice(0, limit)) {
    lines.push(`- ${formatItem(item)}`);
  }
  if (items.length > limit) {
    lines.push(`- ${CONTEXT_TRUNCATED_MARKER}: ${items.length - limit} more`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]));
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fitLinesToBudget(lines: string[], maxChars: number): string {
  const sanitizedLines = lines.map(redactSensitiveText);
  const fullPrompt = sanitizedLines.join("\n");
  if (fullPrompt.length <= maxChars) {
    return fullPrompt;
  }

  const suffix = `\n${CONTEXT_TRUNCATED_MARKER}`;
  if (maxChars <= suffix.length) {
    return suffix.slice(0, Math.max(0, maxChars));
  }

  const limit = maxChars - suffix.length;
  const output: string[] = [];
  let usedChars = 0;

  for (const line of sanitizedLines) {
    const nextCost = line.length + (output.length > 0 ? 1 : 0);
    if (usedChars + nextCost <= limit) {
      output.push(line);
      usedChars += nextCost;
      continue;
    }

    const remaining = limit - usedChars - (output.length > 0 ? 1 : 0);
    if (remaining > TRUNCATED_MARKER.length) {
      output.push(clipText(line, remaining));
    }
    break;
  }

  return `${output.join("\n")}${suffix}`;
}

function clipText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  if (maxChars <= TRUNCATED_MARKER.length) {
    return value.slice(0, Math.max(0, maxChars));
  }

  return `${value.slice(0, maxChars - TRUNCATED_MARKER.length)}${TRUNCATED_MARKER}`;
}
