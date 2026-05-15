import Link from "next/link";

const footerLinks = {
  Platform: [
    { label: "Overview", href: "/platform" },
    { label: "Agentic Identity Recovery", href: "/platform#identity-assurance" },
    { label: "Agentic Data Recovery", href: "/platform#data-assurance" },
    { label: "How It Works", href: "/#how-it-works" },
  ],
  Company: [
    { label: "Why KavachIQ", href: "/#why-kavachiq" },
    { label: "Engineering evidence", href: "/evidence" },
    { label: "Request a Demo", href: "#request-demo" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-border-primary bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="inline-block">
              <span className="text-xl font-bold text-text-primary tracking-tight">
                Kavach<span className="text-accent">IQ</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-text-secondary leading-relaxed max-w-md">
              The undo button for AI-agent incidents. KavachIQ attributes every
              change to the agent&apos;s session and guides operators through
              approval-gated, dependency-ordered reversal — built first for
              Microsoft 365.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                {heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border-primary flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} KavachIQ. All rights reserved.
          </p>
          <p className="text-xs text-text-muted text-center sm:text-right">
            Microsoft 365 today. Copilot Studio + Entra Agent ID coverage Q3 2026.
            {" "}
            <span className="hidden sm:inline">Salesforce Agentforce + ServiceNow Now Assist on the roadmap.</span>
          </p>
        </div>
        <p className="mt-3 text-center text-xs text-text-muted sm:hidden">
          Salesforce Agentforce + ServiceNow Now Assist on the roadmap.
        </p>
      </div>
    </footer>
  );
}
