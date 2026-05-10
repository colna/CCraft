import { Code2, FolderGit2, History, Home, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/projects", label: "项目", icon: FolderGit2 },
  { href: "/diff", label: "变更", icon: Code2 },
  { href: "/settings", label: "设置", icon: Settings }
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="app-screen">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.href} to={item.href} className="nav-item">
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <NavLink to="/" className="nav-item nav-item-muted">
          <History size={18} aria-hidden="true" />
          <span>历史</span>
        </NavLink>
      </nav>
    </div>
  );
}
