import { appConfig, websiteNav } from "@devchat/config";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand">{appConfig.name}</Link>
      <nav aria-label="官网导航">
        {websiteNav.map((item) => (
          <Link key={item.href} href={item.href}>{item.label}</Link>
        ))}
      </nav>
    </header>
  );
}
