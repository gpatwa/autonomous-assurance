/**
 * Console operator UI layout.
 *
 * Nested inside the root layout — the marketing Navbar sits above this.
 * The console adds a left sidebar for operator navigation (Incidents, Changes).
 *
 * TODO (Week 4 Day 4): when Entra External ID auth is wired, this layout
 * will redirect unauthenticated requests to the sign-in page.
 */

import Link from "next/link";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border-primary bg-bg-surface px-4 py-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Operator Console
        </p>
        <nav className="space-y-1">
          <SidebarLink href="/console/incidents" label="Incidents" />
          <SidebarLink href="/console/changes" label="Changes" />
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto px-8 py-6">{children}</div>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
    >
      {label}
    </Link>
  );
}
