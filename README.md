# KavachIQ Agentic Incident Recovery

The public marketing site for **KavachIQ Agentic Incident Recovery**: the undo button for AI-agent incidents in Microsoft 365.

Live site: [agents.kavachiq.com](https://agents.kavachiq.com/)

## What This Is

KavachIQ Agentic Incident Recovery is the operational recovery layer for AI-agent incidents. Detection tools tell you something happened. Backup tools restore data to a point in time. KavachIQ attributes identity, sharing, permission, Conditional Access, DLP, and data changes to the agent's session, proposes a dependency-ordered reversal plan, and executes it after operator approval with audit evidence.

This repository contains the public product site for the agents subdomain. It is intentionally separate from the parent KavachIQ backup product at `kavachiq.com`.

## What This Is Not

- Not the parent KavachIQ backup / ransomware recovery product.
- Not a SIEM, SOAR, governance, or generic AI safety site.
- Not the product platform runtime. The `platform/` directory is a separate workspace with its own lifecycle.

## Stack

- Next.js 16 app router with Turbopack
- React 19
- Tailwind CSS
- Framer Motion
- NextAuth for auth-gated console routes
- Azure Linux App Service for `agents.kavachiq.com`

## Quick Start

Use Node 20 to match the Azure runtime.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run build
```

Production SEO contract:

```bash
SITE_URL=https://agents.kavachiq.com npm run verify:seo
```

Staging audit:

```bash
STAGING_URL=https://staging.kavachiq.com npm run verify:staging
```

## Deploy

The agents subdomain is deployed to Azure App Service as a Next.js standalone zip artifact. The production app setting is:

```bash
NEXT_PUBLIC_SITE_ORIGIN=https://agents.kavachiq.com
```

See [docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md](docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md) for the full Azure + Cloudflare deploy, rollback, and verification procedure.

## Repo Map

```text
src/
├── app/                    # Next.js app routes, metadata, robots, sitemap
├── components/             # Page sections, layout, UI, visuals, demo
├── lib/                    # Site config, analytics, animation helpers
└── proxy.ts                # Next.js 16 middleware equivalent

docs/                       # Copy locks, SEO plan, deploy runbook, product context
infra/                      # Azure Bicep
platform/                   # Separate product platform workspace
scripts/                    # SEO, staging, and deploy helpers
```

## Positioning Guardrails

The wedge is locked: **Agentic Incident Recovery (AIR)** for Microsoft 365.

Anchor language:

- Hero promise: **The undo button for AI-agent incidents.**
- Surface focus: Entra ID, SharePoint, OneDrive, Exchange, Teams, Conditional Access, and DLP.
- Trust posture: approval-gated reversal, least-privilege Microsoft access, tenant-scoped isolation, audit and evidence pack.
- Anti-positions: not backup, not SIEM, not governance, not generic AI safety.

If page copy changes, keep the corresponding locked copy doc in sync:

- [docs/LANDING_PAGE_COPY_V2.md](docs/LANDING_PAGE_COPY_V2.md)
- [docs/PLATFORM_PAGE_COPY_V1.md](docs/PLATFORM_PAGE_COPY_V1.md)
- [docs/AGENTS_SUBDOMAIN_SEO_PLAN.md](docs/AGENTS_SUBDOMAIN_SEO_PLAN.md)

## Search

The public site is verified in Google Search Console by the HTML file in `public/google84fde4d05129ce2e.html`. Do not remove that file unless another ownership verification method has been added.
