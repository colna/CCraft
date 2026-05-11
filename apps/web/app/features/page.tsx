import { features } from "../../content/site";

export const metadata = {
  title: "Features",
  description: "Explore DevChat Studio features for conversational development, diff review, secure storage, and GitHub-native workflows."
};

export default function FeaturesPage() {
  return (
    <>
      <section className="page-hero">
        <div>
          <p className="eyebrow">Features · 功能</p>
          <h1 className="page-title">From idea to diff to ship.</h1>
          <p className="page-lead">A complete loop for lightweight AI product work. 为轻量 AI 产品开发设计的闭环。</p>
        </div>
      </section>
      <section className="page-content">
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="card">
              <h3>{feature.title}</h3>
              <p className="zh-label">{feature.titleZh}</p>
              <p>{feature.body}</p>
              <p className="zh-card-copy">{feature.bodyZh}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
