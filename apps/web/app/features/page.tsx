import { features } from "../../content/site";

export const metadata = {
  title: "功能",
  description: "了解 DevChat 的对话开发、Diff 审查、安全存储和 GitHub 集成能力。"
};

export default function FeaturesPage() {
  return (
    <>
      <section className="page-hero">
        <h1 className="page-title">功能</h1>
        <p className="page-lead">为移动端轻量开发设计的完整闭环。</p>
      </section>
      <section className="page-content">
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
