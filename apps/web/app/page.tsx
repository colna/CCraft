import Link from "next/link";
import { DownloadButton } from "../components/DownloadButton";
import { features } from "../content/site";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>DevChat</h1>
        <p>手机里的 AI 编程工作台。对话修改代码，审查 Diff，确认后提交。</p>
        <div className="hero-actions">
          <DownloadButton />
          <Link href="/docs" className="button secondary">查看文档</Link>
        </div>
        <div className="product-frame" aria-label="产品界面示意">
          <div className="product-screen">
            <aside className="screen-sidebar">
              <strong>my-app · main</strong>
              <p>React + TypeScript</p>
              <p>快照已加载</p>
            </aside>
            <div className="screen-chat">
              <div className="bubble user">帮我给 UserList 加搜索框</div>
              <div className="bubble">需要修改 1 个文件，我已生成 Diff。</div>
              <div className="diff-mini">+ const [search, setSearch] = useState('')</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>从想法到提交，一条移动端工作流。</h2>
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
