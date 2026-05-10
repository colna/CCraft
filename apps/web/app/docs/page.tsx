export const metadata = {
  title: "文档",
  description: "DevChat 快速开始、配置说明和常见问题。"
};

export default function DocsPage() {
  const docs = [
    ["快速开始", "配置 AI 模型，绑定 GitHub，选择仓库开始第一轮对话。"],
    ["配置说明", "了解 Base URL、API Key、Model Name 和 OAuth 授权。"],
    ["FAQ", "处理连接失败、Push 冲突、Token 过期等常见问题。"]
  ];

  return (
    <>
      <section className="page-hero">
        <h1 className="page-title">文档与支持</h1>
        <p className="page-lead">从安装到第一次 Commit & Push。</p>
      </section>
      <section className="page-content">
        <div className="doc-grid">
          {docs.map(([title, body]) => (
            <article key={title} className="card">
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
