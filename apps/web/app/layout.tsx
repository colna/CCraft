import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DevChat",
    template: "%s | DevChat"
  },
  description: "DevChat 是手机里的 AI 编程工作台，支持对话修改代码、审查 Diff 并提交到 GitHub。",
  openGraph: {
    title: "DevChat",
    description: "手机里的 AI 编程工作台",
    siteName: "DevChat",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="site-shell">
          <SiteHeader />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
