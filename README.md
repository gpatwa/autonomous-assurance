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
- Cloudflare Pages for the public marketing routes at `agents.kavachiq.com`
- Azure Container Apps for the separate platform runtime

## Quick Start

Use Node 20 for local development. The Cloudflare deployment workflow uses Node 22 for its current Wrangler release.

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

The public marketing site is deployed to Cloudflare Pages as a static Next.js export. The production origin is:

```bash
NEXT_PUBLIC_SITE_ORIGIN=https://agents.kavachiq.com
```

Build and publish it with:

```bash
CLOUDFLARE_API_TOKEN=<token-with-pages-and-dns-edit> npm run sync:cloudflare
CLOUDFLARE_API_TOKEN=<token-with-pages-and-dns-edit> npm run deploy:marketing
```

The sync step creates the Pages project and custom-domain binding when needed, and reconciles `agents.kavachiq.com` to the Pages hostname. The `/api/demo-request` endpoint is a Cloudflare Pages Function and requires the `RESEND_API_KEY` Pages secret. The protected `/console` routes and product platform runtime remain outside this static marketing deployment. See [docs/CLOUDFLARE_MARKETING_DEPLOY_RUNBOOK.md](docs/CLOUDFLARE_MARKETING_DEPLOY_RUNBOOK.md) for setup, DNS, secrets, and verification.

Pushes to `main` run the same checks, Cloudflare reconciliation, deploy, and SEO verification through `.github/workflows/deploy-marketing.yml`. Configure the `CLOUDFLARE_API_TOKEN` GitHub Actions secret once; it must include Pages Edit and DNS Edit for the `kavachiq.com` zone.

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
