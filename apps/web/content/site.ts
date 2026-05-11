export const features = [
  {
    title: "Conversational development",
    titleZh: "对话式开发",
    body: "Describe intent in natural language, review the generated diff, and keep control before every commit.",
    bodyZh: "用自然语言描述需求，审查 AI 生成的 Diff，确认后再提交。"
  },
  {
    title: "Diff review",
    titleZh: "Diff 审查",
    body: "Read changes file by file, select what ships, and turn AI output into accountable product work.",
    bodyZh: "逐文件查看增删行，选择要发布的修改，把 AI 产出变成可审查工作流。"
  },
  {
    title: "Secure by design",
    titleZh: "安全边界",
    body: "Keys, tokens, and sensitive project data stay behind explicit native and service boundaries.",
    bodyZh: "密钥、Token 和敏感项目数据保留在清晰的原生层与服务边界内。"
  },
  {
    title: "GitHub-native flow",
    titleZh: "GitHub 工作流",
    body: "Connect repositories, load snapshots, draft changes, and publish through a familiar Git workflow.",
    bodyZh: "连接仓库、加载快照、生成修改，并沿用熟悉的 Git 发布路径。"
  }
] as const;

export const productShowcase = [
  {
    title: "DevChat",
    label: "AI Coding Workspace",
    labelZh: "AI 编程工作台",
    description: "A mobile-first coding workspace for changing code through conversation, reviewing diffs, and shipping to GitHub.",
    descriptionZh: "手机里的 AI 编程工作台，对话修改代码，审查 Diff，再把变更提交到 GitHub。",
    metric: "1-tap diff"
  },
  {
    title: "LaunchPad",
    label: "Product Composer",
    labelZh: "产品生成器",
    description: "Turn one product idea into structure, interface directions, implementation slices, and a playable prototype.",
    descriptionZh: "把一句产品想法展开成信息架构、界面方向、任务拆解和首个可运行原型。",
    metric: "48h MVP"
  },
  {
    title: "SignalRoom",
    label: "Social Intelligence",
    labelZh: "社交智能",
    description: "An AI signal board for creator communities, tracking trends, sentiment, and the next meaningful interaction.",
    descriptionZh: "为年轻社区和创作者设计的 AI 信号面板，捕捉趋势、情绪和下一次互动。",
    metric: "live pulse"
  },
  {
    title: "MuseKit",
    label: "Creative Tools",
    labelZh: "创作工具",
    description: "A generative toolkit for design, copy, and product teams that preserves taste while accelerating output.",
    descriptionZh: "为设计、文案和产品团队准备的生成式工具箱，保留人的判断，也提升产出速度。",
    metric: "idea flow"
  }
] as const;

export const buildPillars = [
  {
    title: "Intelligent Apps",
    titleZh: "智能应用",
    body: "We design AI agents, mobile workspaces, and context-aware interfaces around complete user journeys.",
    bodyZh: "从 AI agent、移动端工作台到上下文感知界面，围绕完整任务链路设计产品。",
    detail: "Apps that think with users"
  },
  {
    title: "Creative Tools",
    titleZh: "创作工具",
    body: "We translate model capability into controllable, reviewable tools instead of one-off chat windows.",
    bodyZh: "把模型能力转译成可控、可审查、可重复使用的工具，而不是一次性的聊天窗口。",
    detail: "Creative systems for teams"
  },
  {
    title: "Social Experiences",
    titleZh: "社交体验",
    body: "We build natural input, feedback, and collaboration loops so AI products feel social, rhythmic, and alive.",
    bodyZh: "用更自然的输入、反馈和协作机制，让 AI 产品具有情绪、节奏和社群感。",
    detail: "Human loops, not dashboards"
  }
] as const;

export const studioPrinciples = [
  {
    title: "Move fast with taste",
    titleZh: "快一点，也要有品味",
    body: "We prototype in small slices, use real constraints early, and keep momentum visible in the product.",
    bodyZh: "用小步原型、真实约束和可验证体验推进，而不是把想象停在文档里。",
    value: "Speed"
  },
  {
    title: "Make interfaces memorable",
    titleZh: "让界面有记忆点",
    body: "A command center, a warm light trail, a tactile hover state: every product needs a signature moment.",
    bodyZh: "一个命令中心、一束暖光、一种让人愿意触碰的反馈，都会成为产品的记忆点。",
    value: "Imagination"
  },
  {
    title: "Keep technology human",
    titleZh: "让技术靠近人",
    body: "The best AI products reduce configuration and increase control, companionship, and trust.",
    bodyZh: "技术应该靠近人的表达方式，减少配置感，增加掌控感、陪伴感和信任感。",
    value: "Humanity"
  }
] as const;

export const interactivePanels = [
  {
    title: "Context loaded",
    body: "12 repos · 48 snapshots · warm start",
    tone: "amber"
  },
  {
    title: "Prototype route",
    body: "React shell · motion pass · copy v2",
    tone: "red"
  },
  {
    title: "AI review",
    body: "3 risks found · 1 fix drafted",
    tone: "gold"
  },
  {
    title: "Ship signal",
    body: "docs, build, preview are aligned",
    tone: "pink"
  }
] as const;

export const changelog = [
  {
    date: "2026-05-10",
    title: "MVP baseline",
    body: "Built the first website shell, app shell, AI configuration, GitHub flow, and diff review task structure. 完成官网、主项目 App 壳层、AI 配置、GitHub 流程和 Diff 审查的首版任务拆解。"
  }
] as const;
