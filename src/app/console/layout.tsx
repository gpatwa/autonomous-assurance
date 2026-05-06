/**
 * Console operator UI layout.
 *
 * Nested inside the root layout — the marketing Navbar sits above this.
 * The console adds a left sidebar for operator navigation (Incidents, Changes).
 * Middleware guards all /console routes; this layout shows the signed-in
 * operator's name and a sign-out button.
 */

import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border-primary bg-bg-surface px-4 py-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Operator Console
        </p>
        <nav className="space-y-1">
          <SidebarLink href="/console/incidents" label="Incidents" />
          <SidebarLink href="/console/changes" label="Changes" />
        </nav>

        {/* Operator identity + sign-out */}
        <div className="mt-auto pt-6">
          {session?.user?.name && (
            <p className="mb-2 truncate text-xs text-text-muted" title={session.user.email ?? undefined}>
              {session.user.name}
            </p>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/console/sign-in" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
            >
              Sign out
            </button>
          </form>
        </div>
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
