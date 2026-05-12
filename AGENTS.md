# Repository Guidelines

> 本文件对本仓库后续协作生效。新会话开始后先读取本文件；若与全局规则冲突，以本文件为准。

## 项目结构与模块组织

当前仓库采用 Turborepo monorepo。新增内容时按以下约定组织：

- `apps/devchat/`：主项目 App，使用 Tauri 2.0 + React + TypeScript + Tailwind。
- `apps/web/`：官网 App，使用 Next.js App Router + Tailwind。
- `packages/`：跨 app 共享包，例如 `ui`、`types`、`config`、`tsconfig`、`eslint-config`、`tailwind-config`。
- `tests/`：跨应用或端到端测试；单个 app/package 的测试优先放在对应目录内。
- `assets/`：图片、示例数据、fixtures、设计资源等静态文件。
- `docs/`：架构说明、开发计划、任务报告、运行手册。
- `.agents/skills/`：本仓库可用的本地 skills，按任务类型调用。

构建产物不要放入源码目录；使用 `dist/`、`build/`、`target/` 等明确目录，并加入忽略规则。

## 开发、构建与测试命令

仓库根目录统一通过 Turborepo 编排任务。引入或调整工具链时，优先提供稳定的根目录命令，并在 README 或本文件更新说明：

- `pnpm dev`：启动全部应用的本地开发服务或 watcher。
- `pnpm dev:app`：启动主项目 App（Tauri）。
- `pnpm dev:web`：启动官网 App（Next.js）。
- `pnpm build`：通过 `turbo build` 生成生产构建产物。
- `pnpm test`：通过 `turbo test` 运行完整自动化测试。
- `pnpm lint`：通过 `turbo lint` 运行格式、lint、类型检查。

除非工具文档另有说明，所有命令默认从仓库根目录执行。

## 任务执行流程

每完成一个明确任务，按顺序处理：

1. 补齐或更新测试。
2. 运行相关测试和检查命令。
3. 如存在 `docs/任务报告.md`，追加记录；没有该文件时，在 PR/提交说明中记录验证结果。
4. 检查工作区变更，避免混入无关修改。
5. 提交代码；未经用户明确要求，不执行破坏性 Git 操作。
6. 每产生一个 commit 后，立即执行 `git push` 推送到对应远端分支；若 push 失败，需记录原因并向用户报告。

涉及 UI/UX 或特定语言/框架时，先按下方 skill 规则读取对应规范，再动手实现。

## Skills 使用规则

本仓库已迁入以下本地 UI/框架 skills：

- `.agents/skills/apple-design`：涉及 Apple 风格、macOS 桌面体验、产品展示页或系统化视觉规范时使用。
- `.agents/skills/frontend-design`：涉及页面、组件、布局、动效、响应式或可访问性时使用。
- `.agents/skills/vercel-react-best-practices`：新增、重构或 review React / Next.js 组件、hooks、数据获取和性能相关代码时使用。
- `.agents/skills/next-best-practices`：修改 Next.js 路由、RSC 边界、metadata、route handlers、image/font、bundling 等代码时使用。
- `.agents/skills/skill-creator`：需要新增或维护 Codex skill 时使用。

UI/UX 任务优先按 `apple-design` → `frontend-design` 的顺序读取；Next.js 任务按 `vercel-react-best-practices` → `next-best-practices` 的顺序读取。若运行环境未自动识别本地 skill，直接打开对应 `SKILL.md` 作为规范来源。

本仓库也已迁入 `git@github.com:addyosmani/agent-skills.git` 提供的工程流程 skills，位于 `.agents/skills/`。新会话重启 Codex 后可直接按任务类型触发；未自动识别时，直接打开对应 `SKILL.md` 作为规范来源。

常用 Agent Skills 触发规则：

- `using-agent-skills`：需要判断当前任务适合哪个 skill，或任务横跨多个工程阶段时使用。
- `idea-refine`：需求还不清晰、需要收敛想法或定义问题时使用。
- `spec-driven-development`：启动新项目、新功能、重大变更或需求不完整时使用。
- `planning-and-task-breakdown`：已有规格说明但需要拆分任务、估算范围或安排并行工作时使用。
- `incremental-implementation`：进入具体实现阶段时使用，保持小步提交、可验证交付。
- `test-driven-development`：新增逻辑、修复 bug、修改行为或需要证明变更正确性时使用。
- `code-review-and-quality`：合并前、自查代码、review 他人或 agent 产出时使用。
- `security-and-hardening`：涉及用户输入、认证授权、敏感数据、外部 API、OAuth、Webhook、文件上传时使用。
- `performance-optimization`：存在性能目标、疑似性能回退、Core Web Vitals 或大数据量渲染问题时使用。
- `frontend-ui-engineering`：构建或修改用户界面时使用；与本仓库 `apple-design`、`frontend-design` 共同适用时，先读本仓库 UI skill，再读该工程实现 skill。
- `api-and-interface-design`：设计 API、模块接口、公共类型或跨 app/package 合同时使用。
- `documentation-and-adrs`：做架构决策、公共 API 变更、重要功能交付或需要沉淀上下文时使用。
- `git-workflow-and-versioning`：分支、提交、版本号、变更集或发布前 Git 流程需要判断时使用。
- `ci-cd-and-automation`：修改 CI/CD、自动化脚本、构建流水线时使用。
- `debugging-and-error-recovery`：线上/本地错误排查、测试失败、回归定位时使用。
- `deprecation-and-migration`：迁移框架、升级依赖、废弃旧接口或做兼容策略时使用。
- `source-driven-development`：实现依赖外部文档、协议、SDK 或需要按源材料验证时使用。
- `doubt-driven-development`：高风险、不熟悉代码、需求互相冲突或存在明显不确定性时使用。
- `browser-testing-with-devtools`：需要浏览器运行态验证、DevTools 性能/网络/可访问性检查时使用。
- `code-simplification`：发现实现过度复杂、需要删除冗余抽象或压缩维护成本时使用。
- `context-engineering`：任务需要整理上下文、生成项目快照或为后续 agent 保留工作记忆时使用。
- `shipping-and-launch`：发布、上线检查、回滚计划和发布说明相关任务时使用。

本仓库额外安装了 `https://github.com/mattpocock/skills` 中较有补充价值的 skills，作为现有工程流程的补充而非替代：

- `triage`：创建/整理 issue、处理 bug 或 feature request、准备可交给后台 agent 的 issue 时使用。
- `to-issues`：把计划、spec 或 PRD 拆成 issue tracker 上可独立领取的实施票据时使用。
- `to-prd`：需要把当前对话上下文整理成 PRD 并发布到 issue tracker 时使用。
- `prototype`：需要一次性原型验证数据模型、状态机、终端交互或多套 UI 方向时使用。
- `zoom-out`：对代码区域不熟、需要先获得更高层上下文或系统位置感时使用。
- `grill-with-docs`：需要用现有领域语言、`CONTEXT.md` 或 ADR 反向拷问方案，并同步沉淀文档时使用。
- `grill-me`：用户希望被追问、挑战和压力测试计划/设计时使用。
- `setup-pre-commit`：需要配置 Husky、lint-staged、Prettier、类型检查或提交前测试时使用。

## 编码风格与命名约定

默认使用中文回复；技术术语、路径、命令和标识符保持原文。代码注释只解释不显然的原因，不复述代码行为。目录名优先使用小写短横线，如 `data-import/`；函数、类、变量遵循语言惯例，例如 Python `snake_case`、TypeScript `camelCase`、Rust `snake_case`。

新增格式化工具后，提交前必须运行对应 formatter/linter，不使用 `--no-verify` 等方式绕过检查。

## 测试规范

新增功能必须配套测试；修复 bug 必须包含回归测试。测试文件命名应便于测试框架发现，例如 `test_parser.py`、`parser.test.ts`、`parser.spec.ts`。外部服务调用优先使用 mock 或 fixture，禁止把真实 API Key 写入测试或 CI。

## 提交与 Pull Request

当前仓库没有提交历史可参考。后续采用 Conventional Commits，例如 `feat: add import parser`、`fix: handle empty config`。每个提交聚焦一个逻辑变更。

PR 需包含：变更摘要、验证命令与结果、关联 issue（如有）、用户可见变化的截图或终端输出。未完成事项必须显式列为 follow-up。

## 安全与配置

不要提交密钥、本地 `.env`、机器专用路径或个人凭据。需要配置时提供 `.env.example`，并在 `docs/` 或 README 中说明变量用途、默认值和是否必填。
