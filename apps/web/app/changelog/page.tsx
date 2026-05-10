import { changelog } from "../../content/site";

export const metadata = {
  title: "更新公告",
  description: "查看 DevChat 的产品更新。"
};

export default function ChangelogPage() {
  return (
    <>
      <section className="page-hero">
        <h1 className="page-title">更新公告</h1>
        <p className="page-lead">按时间倒序记录产品变化。</p>
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
