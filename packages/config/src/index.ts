export const appConfig = {
  name: "DevChat",
  tagline: "手机里的 AI 编程工作台",
  description: "通过对话修改代码，审查 Diff，确认后提交到 GitHub。",
  oauthCallbackScheme: "devchat://callback/github",
  supportedAiDomains: [
    "https://api.github.com/**",
    "https://*.openai.com/**",
    "https://api.anthropic.com/**"
  ]
} as const;

export const websiteNav = [
  { href: "/features", label: "功能" },
  { href: "/download", label: "下载" },
  { href: "/docs", label: "文档" },
  { href: "/changelog", label: "更新" }
] as const;
