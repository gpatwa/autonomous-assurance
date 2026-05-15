# Agent Handoff — KavachIQ marketing site

**You are inheriting an active marketing repository.** This doc is your 10-minute orientation. Deeper context lives in `docs/CODEX_ONBOARDING.md`. Read this first.

> For Claude-specific behavioral guidance, see `CLAUDE.md` in the repo root (kept separate so it doesn't apply to Codex).

---

<!-- BEGIN:nextjs-agent-rules -->
## ⚠ This is NOT the Next.js you know

Next.js 16.2.3 with Turbopack. The structure, APIs, and conventions may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js-specific code. Heed deprecation notices.

Specific things to know:
- `app/` router, not `pages/`
- Middleware lives at `src/proxy.ts` (not `src/middleware.ts`)
- `metadata` export pattern is server-component-only
- `whileInView` Framer Motion animations may not fire reliably in SSR / Playwright headless screenshots — be careful with hydration
<!-- END:nextjs-agent-rules -->

---

## What this repo is

The **public marketing site** for **KavachIQ Agentic Incident Recovery** — one product of a two-product brand:

| Product | Hostname | Repo | What it is |
|---|---|---|---|
| KavachIQ (parent — backup / ransomware recovery) | `kavachiq.com` | _separate repo, not this one_ | The parent brand's backup product. |
| **KavachIQ Agentic Incident Recovery** | `agents.kavachiq.com` | **this repo** | The undo button for AI-agent incidents in Microsoft 365. |

The brand parent (`KavachIQ`) is preserved in JSON-LD publisher metadata. This site's `SITE_NAME` is `"KavachIQ Agentic Incident Recovery"` (not just `"KavachIQ"`).

---

## Project state as of handoff

- **v2.0.0 just shipped:** [release](https://github.com/gpatwa/autonomous-assurance/releases/tag/v2.0.0). Full repositioning to **Agentic Incident Recovery** wedge.
- **Branch state:** `main` is at merge commit `cd00f54`. The 16-commit history of the launch is preserved (no squash).
- **Pre-handoff PR:** [PR #1](https://github.com/gpatwa/autonomous-assurance/pull/1) (merged). Read the PR description for the narrative arc.
- **Live site:** `https://agents.kavachiq.com` (Azure-hosted, see `docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md`).
- **Build status:** `next build` produces 19 routes cleanly. `tsc --noEmit` clean. `eslint` clean.

---

## The wedge — do not drift

| Element | Value |
|---|---|
| Category | **Agentic Incident Recovery (AIR)** |
| Hero promise | **"The undo button for AI-agent incidents."** |
| Surface focus | Microsoft 365 (Entra ID, SharePoint, OneDrive, Exchange, Teams, Conditional Access, DLP) |
| Primary buyer | CISO + DFIR lead |
| Trust posture | Approval-gated reversal · least-privilege Microsoft access · tenant-scoped isolation · audit + evidence pack |
| Anti-positions | NOT backup. NOT SIEM. NOT governance. NOT generic AI safety. |

The wedge is **locked**. Any copy change that drifts from it requires founder approval first.

---

## Source-of-truth docs (locked — read before changing copy)

| Doc | What it locks |
|---|---|
| `docs/LANDING_PAGE_COPY_V2.md` | Every word on the homepage `/` |
| `docs/PLATFORM_PAGE_COPY_V1.md` | Every word on `/platform` |
| `docs/COMPETITIVE_POSITIONING_V1.md` | Battle cards vs Rubrik / Cohesity / Microsoft native / Zenity / ServiceNow |
| `docs/PROCUREMENT_SECURITY_DETAIL_V1.md` | **NDA-gated** — implementation specifics for procurement conversations. Do not link from the public site. |
| `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md` | SEO + metadata contract. `npm run verify:seo` checks 16 assertions against this. |

**Rule:** if you change copy on a page, update the corresponding locked doc in the same commit. Doc and code stay in sync, always.

---

## Quick start

```bash
# Install
npm install

# Dev server (port 3000)
npm run dev

# Production build
npm run build

# Typecheck
npx tsc --noEmit -p tsconfig.json

# Lint
npm run lint

# Verify SEO contracts against deployed site
SITE_URL=https://agents.kavachiq.com npm run verify:seo

# Verify staging site (audit screenshots + stale-phrase detection)
STAGING_URL=https://staging.kavachiq.com npm run verify:staging
```

---

## Repo map (what lives where)

```
src/
├── app/                      # Next.js 16 app router
│   ├── layout.tsx            # Root layout — metadata, OG, JSON-LD
│   ├── page.tsx              # / homepage
│   ├── platform/page.tsx     # /platform
│   ├── demo/page.tsx         # /demo (noindex, interactive)
│   ├── evidence/page.tsx     # /evidence
│   ├── console/              # operator console (auth-gated)
│   ├── api/                  # demo-request intake + nextauth
│   ├── opengraph-image.tsx   # OG image (rendered, not static)
│   ├── robots.ts             # environment-aware robots.txt
│   └── sitemap.ts            # /, /platform only
├── components/
│   ├── pages/                # page orchestrators (homepage, platform)
│   ├── sections/landing/     # 10 homepage section components
│   ├── sections/platform/    # 9 platform section components
│   ├── visuals/              # animated recovery walkthrough, hero, vendor marks
│   ├── ui/                   # Button, SectionHeader, CTABlock, etc.
│   ├── layout/               # Navbar, Footer
│   └── demo/                 # /demo interactive components
├── lib/
│   ├── site.ts               # ⭐ Single source of truth for SITE_NAME, origin, brand
│   ├── animations.ts         # Framer Motion variants
│   └── analytics.ts          # PostHog wrapper
└── proxy.ts                  # Next.js 16 middleware equivalent (auth gate)

docs/                         # 30+ docs — most relevant in source-of-truth table above
infra/                        # Bicep for Azure deployment
platform/                     # The actual product platform (separate workspace — not the marketing site)
scripts/                      # verify-seo, verify-staging, deploy-dev
```

---

## What you most likely need to touch (and what NOT to touch)

**Likely tasks:**
- Marketing copy updates in `src/components/sections/landing/` or `src/components/sections/platform/`
- Metadata updates in `src/app/*/page.tsx`
- New CTA forms / intake endpoints in `src/app/api/`
- Asset replacements in `src/components/visuals/` (when real video / Lottie / vendor logos arrive)

**Probably do not touch:**
- `platform/` directory — that's the actual product platform (a separate workspace). Marketing site work doesn't touch it.
- `src/lib/site.ts` `SITE_NAME` — that's the formal product name. Renaming requires founder approval + coordinated changes across SEO assertions, OG image, and the SEO plan doc.
- Locked copy docs without doing the corresponding code change in the same commit.

---

## Founder working style (you'll see this in the git history)

1. **Copy locks before code.** Founder reviews copy docs (`*_COPY_*.md`) BEFORE any component is built. Code follows locked copy verbatim.
2. **Narrow scope per ask.** Each user message gets a focused commit or PR. Don't expand scope unilaterally — if you spot adjacent work, surface it as a flag, don't do it.
3. **Surface tradeoffs explicitly.** When multiple interpretations exist, list them and recommend one — don't pick silently.
4. **Push back when warranted.** If a request would create overclaim, vendor channel conflict, or scope creep, raise it before executing.
5. **Honest about gaps.** Don't claim shipped features that aren't shipped. The "What can / What can't" distinction matters to this buyer (CISOs).
6. **Commit after each meaningful change.** Founder explicitly approves commits; don't batch silently. Use the `Co-Authored-By` trailer.

---

## Commit + branch conventions

- Commits: `<type>(<scope>): <short description>` then 1-2 sentence body. Examples in `git log --oneline -20`.
- Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`.
- Branches: `feat/<thing>` for new work, merged via PR.
- PRs: **Don't squash.** Preserve commit history — the narrative is valuable.
- Final commit trailer (adapt the model name):
  ```
  Co-Authored-By: <your-model-name> <noreply@openai.com>
  ```

---

## Common gotchas (things learned the hard way)

1. **Grammarly + hydration warnings:** `<body>` in `src/app/layout.tsx` carries `suppressHydrationWarning` because browser extensions (Grammarly, password managers) inject `data-*` attributes after SSR. Don't remove it.
2. **Framer Motion `whileInView` + Playwright:** `viewport={{ once: true, margin: "-80px" }}` doesn't fire reliably in headless screenshots. Use `--full-page` with a scripted scroll-through, not the default Playwright full-page.
3. **`#why-kavachiq` anchor:** The Navbar + Footer link to this id. It's currently on the **Recovery Gap** section (`RecoveryGap.tsx`). If you move that content, move the id with it.
4. **CTABlock copy:** The `headline`/`body`/`ctaText` are props. But the two info-tiles inside the form (`In the demo, you will see` / `What you will walk away with`) are hardcoded — update them too when you change CTA framing.
5. **OG image is rendered, not static:** `src/app/opengraph-image.tsx` renders a PNG at build time. Update copy there separately when changing the wedge hero.
6. **`infra/main.json` is a build artifact:** Generated by `az bicep build`. In `.gitignore`. Don't commit it.
7. **Two `SITE_NAME` assertions exist:** `scripts/verify-seo.ts` and `scripts/verify-staging.ts` both hardcode the product name. If you rename the product, update both AND the SEO plan doc.
8. **`docs/PROCUREMENT_SECURITY_DETAIL_V1.md` is NDA-gated:** Never link to it from `kavachiq.com` or `agents.kavachiq.com`. Distribution is CRM-tracked sends only.
9. **`verify-staging.ts` actively flags the old wedge.** If you ever see `"Autonomous Assurance"`, `"Identity Assurance"`, `"trusted operational state"`, `"signed JSON"`, etc. on the live site, the audit catches it as a regression. Don't reintroduce them.

---

## Known follow-ups (intentionally deferred, NOT bugs)

Pre-existing flags from the v2.0.0 launch. Each needs founder direction before action:

| # | Item | Notes |
|---|---|---|
| 1 | Real demo walkthrough video | `LiveRecoveryDemo` currently shows `RecoveryWalkthrough` Framer animation. Replace `<RecoveryWalkthrough />` with a `<video>` element when produced. |
| 2 | Real hero recovery animation | Currently `HeroRecoveryAnimation` (Framer 4-stage). Upgrade to Lottie if design wants. |
| 3 | Real monochrome vendor SVG logos | `VendorMarks` uses geometric glyphs + text wordmarks. Trademark-safe; replace with real marks when design supplies them. |
| 4 | Per-incident card visuals | Currently typographic badges. Optional. |
| 5 | Pricing page | Deliberately scoped out of v2.0.0. |
| 6 | Customer logos section | No customers to feature yet. |
| 7 | SOC 2 / ISO 27001 roadmap | Procurement doc says no formal certs today (truthful). |
| 8 | Sales-enablement deck | Procurement-detail doc is reading material. A companion deck for live walkthroughs is needed. |

---

## What to read next, in order

1. **`README.md`** — Next.js basics (skip if you know Next.js 16)
2. **This file** (you are here)
3. **`docs/CODEX_ONBOARDING.md`** — deeper handoff context, founder priorities, strategic background
4. **`docs/LANDING_PAGE_COPY_V2.md`** — homepage copy source of truth
5. **`docs/PLATFORM_PAGE_COPY_V1.md`** — platform copy source of truth
6. **`docs/COMPETITIVE_POSITIONING_V1.md`** — competitive battle cards
7. **`git log --oneline -20 main`** — narrative arc of the v2.0.0 launch

---

## When in doubt

Ask the founder before acting. The pattern that worked through the v2.0.0 launch:

1. Surface the question + 2-3 options + a recommendation
2. Wait for founder to pick
3. Execute the picked option, narrow scope
4. Commit
5. Push when asked

This bias toward **clarify before code** is in `CLAUDE.md` § 1. It applies to Codex too.

Welcome. Ship carefully.
