export const appConfig = {
  name: "DevChat",
  tagline: "AI coding workspace in your pocket",
  taglineZh: "手机里的 AI 编程工作台",
  description: "Change code through conversation, review diffs, and ship to GitHub.",
  descriptionZh: "通过对话修改代码，审查 Diff，确认后提交到 GitHub。",
  oauthCallbackScheme: "devchat://callback/github",
  supportedAiDomains: [
    "https://api.github.com/**",
    "https://*.openai.com/**",
    "https://api.anthropic.com/**"
  ]
} as const;

export const websiteNav = [
  { href: "/features", label: "Features", labelZh: "功能" },
  { href: "/download", label: "Download", labelZh: "下载" },
  { href: "/docs", label: "Docs", labelZh: "文档" },
  { href: "/changelog", label: "Updates", labelZh: "更新" }
] as const;
