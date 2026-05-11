import { appConfig, websiteNav } from "@devchat/config";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span>{appConfig.name}</span>
        <small>Studio</small>
      </Link>
      <nav aria-label="Website navigation">
        {websiteNav.map((item) => (
          <Link key={item.href} href={item.href}>
            <span>{item.label}</span>
            <small>{item.labelZh}</small>
          </Link>
        ))}
      </nav>
    </header>
  );
}
