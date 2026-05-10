export const metadata = {
  title: "下载",
  description: "获取 DevChat iOS、Android 和桌面端状态。"
};

export default function DownloadPage() {
  const channels = [
    ["iOS", "TestFlight / App Store 准备中"],
    ["Android", "Google Play / APK 说明准备中"],
    ["Desktop", "macOS / Windows / Linux 即将推出"]
  ];

  return (
    <>
      <section className="page-hero">
        <h1 className="page-title">下载 DevChat</h1>
        <p className="page-lead">先从移动端开始，桌面端作为后续扩展。</p>
      </section>
      <section className="page-content">
        <div className="download-grid">
          {channels.map(([title, body]) => (
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
