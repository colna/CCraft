import { changelog } from "../../content/site";

export const metadata = {
  title: "Updates",
  description: "Read DevChat product updates."
};

export default function ChangelogPage() {
  return (
    <>
      <section className="page-hero">
        <div>
          <p className="eyebrow">Updates · 更新公告</p>
          <h1 className="page-title">Product changes, newest first.</h1>
          <p className="page-lead">A public record of product progress. 按时间倒序记录产品变化。</p>
        </div>
      </section>
      <section className="page-content">
        <div className="changelog-list">
          {changelog.map((item) => (
            <article key={item.date} className="changelog-item">
              <time>{item.date}</time>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
