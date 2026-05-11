export const metadata = {
  title: "Docs",
  description: "DevChat quick start, configuration notes, and FAQs."
};

export default function DocsPage() {
  const docs = [
    ["Quick start", "快速开始", "Configure an AI model, connect GitHub, choose a repository, and start the first conversation."],
    ["Configuration", "配置说明", "Understand Base URL, API Key, Model Name, OAuth authorization, and local security boundaries."],
    ["FAQ", "常见问题", "Troubleshoot failed connections, push conflicts, expired tokens, and preview environment issues."]
  ];

  return (
    <>
      <section className="page-hero">
        <div>
          <p className="eyebrow">Docs · 文档</p>
          <h1 className="page-title">Build with the studio system.</h1>
          <p className="page-lead">From install to the first commit and push. 从安装到第一次 Commit & Push。</p>
        </div>
      </section>
      <section className="page-content">
        <div className="doc-grid">
          {docs.map(([title, titleZh, body]) => (
            <article key={title} className="card">
              <h3>{title}</h3>
              <p className="zh-label">{titleZh}</p>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
