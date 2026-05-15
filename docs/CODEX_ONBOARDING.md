# Codex Onboarding — Deep Context

**Audience:** Codex (or any new coding agent) taking over from Claude after the v2.0.0 Agentic Incident Recovery launch.

**Purpose:** Strategic + operational background that doesn't fit in `AGENTS.md`. Read after `AGENTS.md`, before opening a PR.

---

## How we got here

The repo's history has two distinct eras:

1. **v0.1 → v1.0 (April 2026):** Early-stage marketing site under the original wedge **"KavachIQ Autonomous Assurance — recovery for high-impact agent-driven changes."** Homepage walked through "Capture / Assess / Recover." Platform page had sections called "Identity Assurance" and "Data Assurance."

2. **v2.0.0 (May 2026):** Full repositioning to **"Agentic Incident Recovery — the undo button for AI-agent incidents in Microsoft 365."** Replaced the old wedge across every surface: homepage, platform page, internal sales docs, technical design docs, SEO assertions, and the formal product name.

You are inheriting the v2.0.0 state. The transition is **complete and merged**. Don't drift back to v1 language; `verify-staging.ts` actively flags the old wedge as a regression.

---

## The wedge in one paragraph

KavachIQ Agentic Incident Recovery is the **operational recovery layer** for AI agents in Microsoft 365. Detection vendors (Purview, Defender, Sentinel, Zenity, WitnessAI) tell you something happened. Backup vendors (Rubrik, Cohesity, Veeam, M365 Backup) restore data to a point in time. Neither reverses the specific identity, sharing, permission, Conditional Access, or DLP changes an AI agent made. KavachIQ attributes every change to the agent's session, proposes a dependency-ordered reversal plan, and executes it after operator approval — preserving every legitimate change that happened in parallel. The line: **"Rubrik is backup. KavachIQ is undo."**

---

## Founder priorities (highest leverage non-coding work)

These are NOT in scope for an agent to do, but you should know they exist because they affect the questions the founder will ask you:

1. **Lock 1 named design partner** — biggest gap from competitive scorecard. Without a named customer story, every battle card is theory.
2. **Brief Gartner + Forrester** — plant *"Agentic Incident Recovery (AIR)"* as a category name before a competitor coins something competing.
3. **Pre-share `PROCUREMENT_SECURITY_DETAIL_V1.md` with 2–3 procurement contacts** under NDA — get feedback before serious procurement conversations.
4. **CISO test calls** validating the wedge sticks — looking for unprompted "rollback" / "recovery" language from buyers.

If the founder ever asks "is X aligned with what we'd want a CISO to see?" — they are testing whether you understand the wedge against this real buyer.

---

## Complete map of the docs/ directory

Many docs predate v2.0.0. Some are wedge-aligned, some are technical design (wedge-independent), some are roadmap (wedge-aligned). Use this map.

### Source-of-truth (locked, current, must update with code changes)

- `LANDING_PAGE_COPY_V2.md` — homepage `/`
- `PLATFORM_PAGE_COPY_V1.md` — `/platform`
- `COMPETITIVE_POSITIONING_V1.md` — competitive battle cards
- `PROCUREMENT_SECURITY_DETAIL_V1.md` — **NDA-gated**, procurement-only

### Brand + SEO contract

- `AGENTS_SUBDOMAIN_SEO_PLAN.md` — `SITE_NAME`, OG, JSON-LD, robots, sitemap contract. `npm run verify:seo` enforces 16 assertions from here.
- `AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` — Azure + Cloudflare deployment runbook
- `BUYER_EXEC_ONE_PAGER.md` / `BUYER_EXEC_ONE_PAGER_SHORT.md` — wedge-aligned sales one-pagers

### Demo + sales-enablement (wedge-aligned)

- `DEMO_SCRIPT.md` — full demo flow: 30s / 2min / 5min / 10min versions; buyer-role question sets; suggested answers; "what not to say"
- `DEMO_CHEAT_SHEET.md` — pre-demo checklist + talking points
- `DEMO_PRESENTER_CARD.md` — one-page mid-call reference (compressed view of cheat sheet)
- `DEMO_OBJECTIONS.md` — 11 common objections + responses

### Technical design (mostly wedge-independent — describes how the platform works internally)

- `ARCHITECTURE_MEMO.md` — overall system architecture (recovery orchestration model)
- `RECOVERY_ORCHESTRATION_DESIGN.md` — recovery plan generation + approval-gated execution
- `TRUSTED_STATE_BASELINE_DESIGN.md` — how the system models "trusted state"
- `BLAST_RADIUS_ENGINE_DESIGN.md` — dependency graph + impact analysis
- `INCIDENT_DETECTION_AND_CLASSIFICATION_DESIGN.md` — incident pipeline
- `CONNECTOR_AND_INGESTION_DESIGN.md` — Microsoft Graph integration
- `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md` — Postgres schema
- `MULTI_TENANT_ARCHITECTURE_DECISIONS.md` — RLS, tenant isolation, per-tenant DEKs
- `ACTION_EXECUTION_MODEL.md` — Graph API write model
- `CANONICAL_SCENARIO_FIXTURE.md` — the canonical demo scenario (Entra group membership change)
- `DEPLOYMENT_AND_OPERATIONS_ARCHITECTURE.md` — production ops model
- `FRONTEND_BACKEND_CONSISTENCY_CHECKLIST.md` — internal API contract notes

### Process + ops

- `ENGINEERING_BOOTSTRAP_DECISIONS.md` — early engineering decisions
- `MVP_IMPLEMENTATION_ROADMAP.md` — 21-week implementation roadmap

### Marketing planning (older — may need refresh)

- _none currently_ (other planning docs were merged into the locked copy docs above)

---

## What lives in `platform/` (DO NOT CONFUSE WITH MARKETING)

`platform/` is the actual product — a separate workspace with a multi-tenant Node.js/TypeScript backend. It is **not** part of the marketing site.

Marketing site work (Codex's likely scope) should not touch `platform/`. If a task requires platform changes, surface it as a question — the founder will route it appropriately.

Brief overview of `platform/` so you can recognize it but stay out:

```
platform/
├── packages/
│   ├── api/          # REST API server (Container App)
│   ├── workers/      # pipeline-worker + polling-worker (Container Apps)
│   ├── orchestration/ # graph-client, polling-driver
│   ├── connectors/   # Microsoft Graph connector layer
│   ├── storage/      # Postgres + RLS + per-tenant DEKs
│   ├── core/         # incident classification + blast-radius engine
│   ├── platform/     # logging + telemetry
│   ├── schema/       # shared type definitions
│   └── auth/         # NextAuth provider config (consumed by marketing site)
├── scripts/          # operations + smoke tests
└── Dockerfile.*      # one per service
```

Test harness lives in `platform/scripts/smoke-*.ts`. Production deploy via `scripts/deploy-dev.sh`.

---

## Build pipeline + verification

Pre-commit (you should run these locally):

```bash
npx tsc --noEmit -p tsconfig.json    # must be clean
npm run lint                          # must be clean
npx next build                        # must succeed (19/19 routes)
```

Post-deploy verification (run after pushing to `agents.kavachiq.com`):

```bash
SITE_URL=https://agents.kavachiq.com npm run verify:seo
# Expected: ✅ PASS (16/16)
# Anything less = production drift; do not proceed with a demo until reconciled.
```

Staging audit (run when you want a full audit report with screenshots + stale-phrase detection):

```bash
STAGING_URL=https://staging.kavachiq.com npm run verify:staging
# Produces: artifacts/staging-site-audit.md + artifacts/staging-site-audit.json
```

---

## Conventions you'll see in the code

**Style:**
- Tailwind, no separate CSS files
- `bg-bg-surface/40` style classes — tokens defined in `tailwind.config.ts`
- Sections use `relative py-24 sm:py-28` consistently
- Containers use `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` (with `max-w-6xl` for narrower variants)
- Cards use `rounded-2xl` or `rounded-[28px]` and `border border-border-primary`

**Components:**
- All section components start with `"use client";` (because Framer Motion needs the client boundary)
- Page orchestrators (`PlatformPageContent.tsx`, `HomePageContent.tsx`) are server components by default — push interactivity to leaves
- Reuse primitives: `Button`, `SectionHeader`, `ProcessStep`, `CTABlock`, `GridPattern`

**Animation:**
- `import { fadeUp, staggerContainer } from "@/lib/animations"` for variants
- `motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}` is the standard pattern
- Hero uses `animate="visible"` (eager, not viewport-triggered) because it's above the fold

**Tracking:**
- `import { track } from "@/lib/analytics"` (PostHog wrapper)
- CTAs call `track("cta_click", { page, label })`

---

## Tone reference (this is how the wedge sounds in copy)

- **Hero:** "The undo button for AI-agent incidents."
- **Differentiation:** "Detection is mature. Operational recovery is the missing layer."
- **vs Backup:** "Rubrik is backup. KavachIQ is undo."
- **vs SIEM:** "Sentinel alerts. KavachIQ acts."
- **vs ServiceNow:** "ServiceNow tickets. KavachIQ acts."
- **vs Governance:** "Governance sets rules. KavachIQ recovers when those rules aren't enough."
- **Trust:** "Recovery you can defend to your auditor, your board, and your own DFIR team."
- **Closing CTA:** "Adoption is moving faster than governance."

If your copy sounds like a generic SaaS tagline, you've drifted. Compare back to these.

---

## What's worked, what's failed

**Worked:**
- Locking copy docs **before** writing components — every section component was built from approved copy
- The credibility-tighten pass — softening "Postgres RLS / signed JSON / Entra External ID" to outcome language ("data layer / exportable evidence / verifiable enterprise identity") because the CISO buyer trusts outcome promises more than implementation specifics
- Walking through real, named incidents (EchoLeak, Copilot Studio AIjacking, Entra Agent ID, Replit) — not invented scenarios
- The 5-quote vendor consensus wall — uses the AI vendors' own quotes to validate the category, which lands much harder than us claiming it ourselves

**Failed (don't repeat):**
- The original Playwright full-page screenshot showed sections as empty because Framer Motion's `whileInView` didn't fire below the fold — fixed by scripting a scroll-through pass before screenshot
- The initial `runApiServer()` auto-call at the bottom of `run-api-server.ts` blocked any test from importing `@kavachiq/api` — fixed by moving the auto-call to a separate `entrypoint.ts` (the pipeline worker had already done this; the API server hadn't)
- Microsoft 365 Copilot's `acknowledged` status was missing from a DB CHECK constraint — caused PATCH 500s. Fixed with migration 0005. **Lesson:** when adding an enum value in code, audit the DB constraint too.

---

## Specific pitfalls you may hit

### "I can't start a dev server, port 3000 is in use"

The founder runs their own `next dev` on port 3000 in this same project directory. Next.js won't let two instances run from the same directory. `.claude/launch.json` has `autoPort: true` so preview tooling picks an alternate port. If you need to test locally, just curl/test against the founder's running server at `localhost:3000` — your code changes are HMR-applied.

### "I changed copy but the homepage looks wrong"

Likely cause: Framer Motion's `whileInView` opacity-0 → opacity-1 hasn't fired yet. Scroll through the page (or test with a scripted scroll-through) before screenshotting. The content IS in the DOM; it's just invisible until scrolled into view.

### "verify-seo fails on `og:site_name`"

Likely cause: `SITE_NAME` was changed in `src/lib/site.ts` but not in `scripts/verify-seo.ts` (or vice versa). Both must agree. Same applies to `scripts/verify-staging.ts`.

### "The hero promise feels off-wedge"

Re-read this line in `LANDING_PAGE_COPY_V2.md`: *"The undo button for AI-agent incidents."* Every change you make to hero copy should be defensible against this. If the new copy doesn't reinforce the "undo button" frame, it's drift.

### "I added a section heading but the Navbar link doesn't scroll to it"

The fixed navbar is `h-16`. Add `scroll-mt-20` to any anchor-targeted `<section>` so the heading isn't covered when scrolled-to. Existing pattern: `<section id="why-kavachiq" className="... scroll-mt-20">`.

---

## Strategic next steps queued (founder will direct these)

| # | Item | When | Notes |
|---|---|---|---|
| 1 | Land design partner | ASAP | Single biggest gap; not a coding task |
| 2 | Real demo walkthrough video | When customer scenario is filmable | Replace `RecoveryWalkthrough` component with `<video>` |
| 3 | Real vendor logos | When design supplies them | Replace `VendorMark` component |
| 4 | Hero animation upgrade | Optional | Could swap `HeroRecoveryAnimation` for Lottie |
| 5 | Sales-engineering deck | Soon | Companion to `PROCUREMENT_SECURITY_DETAIL_V1.md` |
| 6 | Pricing page | After 3+ customer conversations | Out of v2.0.0 scope intentionally |
| 7 | Customer logos section | After first 2 customers ship | Chicken-and-egg today |
| 8 | SOC 2 roadmap | After 5+ customers | No compliance certs today (honest); start when procurement starts asking |

---

## How to escalate

If you encounter a request that:
- Would change the wedge framing on a customer-visible surface
- Would touch `platform/` (the product)
- Would change `SITE_NAME` or formal product naming
- Would publish information from `PROCUREMENT_SECURITY_DETAIL_V1.md` to the public site
- Would reintroduce any phrase from the `STALE_PHRASES` list in `scripts/verify-staging.ts`

**Stop and surface the conflict to the founder before executing.** Each of these has a strategic dimension the founder should decide on, not the agent.

---

## A note on the user

The founder (Gopal) works fast, asks pointed questions, expects you to push back when the request creates risk, and explicitly says "yes" or "go ahead" before you act on anything ambiguous. The pattern that worked through v2.0.0:

1. You: surface 2-3 options + a recommendation
2. Founder: picks one
3. You: execute narrowly
4. You: remind to commit
5. Founder: approves push

If you drift from this pattern (e.g., expand scope unilaterally, batch many changes silently, claim shipped features that aren't shipped), you'll lose trust quickly. **The repo's git history has been preserved un-squashed because the narrative is part of the product.** Keep that legibility intact.

---

Good luck. The wedge is sharp. The infrastructure is healthy. Ship carefully.
