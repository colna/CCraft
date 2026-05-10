export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "info"; children: string }) {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}
