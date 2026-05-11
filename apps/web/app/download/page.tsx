export const metadata = {
  title: "Download",
  description: "Get DevChat iOS, Android, and desktop channel status."
};

export default function DownloadPage() {
  const channels = [
    ["iOS", "移动端优先", "TestFlight and App Store release channel in preparation."],
    ["Android", "开放测试", "Google Play and APK installation notes are being prepared."],
    ["Desktop", "桌面扩展", "macOS, Windows, and Linux companions are planned after the mobile loop."]
  ];

  return (
    <>
      <section className="page-hero">
        <div>
          <p className="eyebrow">Download · 下载</p>
          <h1 className="page-title">Start with DevChat.</h1>
          <p className="page-lead">Mobile-first now, desktop expansion next. 先从移动端开始，桌面端随后扩展。</p>
        </div>
      </section>
      <section className="page-content">
        <div className="download-grid">
          {channels.map(([title, titleZh, body]) => (
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
