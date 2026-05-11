import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DevChat Studio",
    template: "%s | DevChat Studio"
  },
  description: "DevChat Studio 打造智能应用、数字产品和 AI 驱动的用户体验。",
  openGraph: {
    title: "DevChat Studio",
    description: "年轻、快速、设计驱动的 AI 产品工作室。",
    siteName: "DevChat Studio",
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
