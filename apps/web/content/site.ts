export const features = [
  {
    title: "对话式开发",
    body: "用自然语言描述需求，AI 基于项目快照和会话上下文生成修改建议。"
  },
  {
    title: "Diff 审查",
    body: "像在 GitHub 一样查看增删行、逐文件选择，满意后再提交。"
  },
  {
    title: "安全存储",
    body: "API Key 和 GitHub Token 留在 Rust 安全层，WebView 不接触明文。"
  },
  {
    title: "GitHub 集成",
    body: "OAuth 授权后读取仓库、生成快照，并通过 Git Data API 提交。"
  }
] as const;

export const changelog = [
  {
    date: "2026-05-10",
    title: "MVP 基线",
    body: "完成官网、主项目 App 壳层、AI 配置、GitHub 流程和 Diff 审查的首版任务拆解。"
  }
] as const;
