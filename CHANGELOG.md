# Changelog

All notable changes to the KavachIQ Autonomous Assurance marketing site are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.4.0] - 2026-04-11

Launch readiness: real form backend, analytics, favicon, OG image, Azure deployment prep.

### Added
- **Server-side demo form**: `/api/demo-request` Route Handler with server-side validation, optional webhook delivery (`DEMO_REQUEST_WEBHOOK_URL`), and local JSON file fallback storage
- **Form UX states**: loading spinner, success confirmation with checkmark, error messages with field-level validation, disabled button during submission
- **SVG favicon**: K lettermark in accent blue on dark background
- **Dynamic OpenGraph image**: 1200x630 branded image via `next/og` edge runtime
- **Analytics abstraction**: `src/lib/analytics.ts` with provider-agnostic `track()` function; tracks `cta_click`, `form_start`, `form_submit`, `form_success`, `form_error`; ready for Azure App Insights, PostHog, or Plausible
- **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Accessibility**: `focus-visible` outline styles, `prefers-reduced-motion` support
- **Azure deployment**: standalone output mode, `.env.example` with documented variables, React strict mode
- **Button disabled state**: opacity + cursor styling

### Changed
- CTABlock rewritten: removed mailto dependency, replaced with `fetch`-based API submission
- Removed "Copy request details" secondary action (replaced by proper form submission)
- Button component forwards `onClick` to anchor variant

### Technical
- API route stores submissions in `.data/demo-requests.json` when no webhook is configured
- `.data/` added to `.gitignore`
- `.env.example` allowlisted in `.gitignore`

---

## [0.3.0] - 2026-04-11

Copy-only update: positioning-aware language across both pages.

### Changed
- **Positioning**: Microsoft Entra and Microsoft 365 framed as the first wedge, not the permanent boundary; added "connected business platforms", "downstream systems", and forward-looking extension language
- **Hero badge**: "Designed for..." → "Built for Microsoft Entra, Microsoft 365, and the systems around them"
- **Hero subhead**: rewritten to reference "identity, access, systems of record, and connected business platforms"
- **Hero support cards**: tightened copy for Identity-first, Data-aware, Recovery-led
- **What the product does**: new title ("Turn agent-driven change into something your team can actually recover from") and subtitle
- **Challenge section**: body tightened, "KavachIQ" without "Autonomous Assurance" suffix
- **Value props**: titles and descriptions shortened
- **Why KavachIQ**: new title ("The missing layer between AI automation and business recovery"), new subtitle, KavachIQ comparison row widened to include "connected business platforms"
- **Product Pillars**: subtitle updated, pillar descriptions and bullets aligned with provided copy
- **How It Works**: subtitle shortened, step descriptions tightened
- **Homepage CTA**: new headline ("Start the conversation about safe production AI") and body
- **Platform hero body**: rewritten to avoid M365-only framing
- **Platform overview**: subtitle updated
- **Product proof section**: proof cards and operator view heading refined
- **Capabilities**: descriptions tightened
- **Entra section**: "autonomous" → "agent-driven", "policies" → "policy", "issues" → "risk", bullets aligned
- **M365 section**: added forward-looking language about extending to adjacent SaaS platforms; "M365" → "Microsoft 365" throughout; bullets tightened
- **Platform process steps**: "autonomous" → "agent-driven", "known-good" → "trusted"
- **Audience panel**: "buyers" → "teams", card copy tightened
- **Platform CTA**: new headline ("Production AI needs a recovery plan") and body
- **CTABlock helper text**: replaced with "Share your use case and we will follow up with the right conversation"
- **Footer**: "autonomous change" → "agent-driven change"
- **Global**: "M365" expanded to "Microsoft 365" in all public-facing text

---

## [0.2.1] - 2026-04-11

Polish pass: tighten copy, improve structure, fix navigation.

### Changed
- Removed all prototype/temporary language from public-facing copy ("This prototype generates...", "wire it to your CRM...")
- CTA button text changed from "Generate Demo Request" to "Request a Demo" on both pages
- CTA form header changed from "Start a buyer-ready conversation" to "Tell us about your environment"
- CTA badge changed from "Opens your email client" to "We respond within one business day"
- CTA body copy rewritten to remove implementation details
- Comparison table fields renamed to semantic structure: Layer / What it does / Where it stops
- Column headers added to comparison table (visible on md+ breakpoints)
- KavachIQ comparison row description tightened

### Fixed
- Nav links are now context-aware: "How It Works" resolves to the platform page's own section when navigating from /platform, instead of jumping to the homepage
- Visual transition between hero and "What the product does" section strengthened with background tint and gradient border

---

## [0.2.0] - 2026-04-11

Second iteration: product-specific content, stronger differentiation, and a real demo request flow.

### Added
- **RecoveryFlowVisual** signature component showing the incident-to-recovery flow: Agent Action -> Entra Change -> M365 Impact -> Blast Radius -> Guided Recovery
- **"What the product does" section** on the homepage with Capture/Assess/Recover/Govern capability cards paired with the RecoveryFlowVisual
- **Structured comparison table** on the homepage contrasting KavachIQ against Observability, Backup, and Governance with clear gap analysis
- **Hero status badge** ("Designed for Microsoft Entra, Microsoft 365, and connected systems") and three sub-cards (Identity-first, Data-aware, Recovery-led)
- **Product proof section** on the platform page with Capture/Assess/Recover cards and an Operator View panel
- **Detail card grids** replacing placeholder SVG visuals for Identity Assurance (Users/groups, Applications, Policies, Recovery order) and Data Assurance (SharePoint/OneDrive, Exchange, Permission fallout, Trusted operating state)
- **Buyer expectations panel** in the platform Audience section (Scope, Risk, Workflow, Readiness)
- **Real demo request form** in CTABlock with name, email, company, and use case fields; generates a mailto link and supports clipboard copy
- **Per-page metadata** via server/client component split (OpenGraph, Twitter card, title templates)
- **Active nav link highlighting** using `usePathname`

### Changed
- Homepage restructured from 7 to 8 sections with richer, more product-specific content
- Platform page restructured from 8 to 9 sections with concrete product-proof structure
- Nav labels updated: "Tour" -> "How It Works", "About" -> "Why KavachIQ"
- Product Pillar cards now include specific bullet points
- How It Works descriptions enriched with operational context
- Footer description and tagline updated to match product-specific language
- CTA text changed from "Request a Demo" to "Generate Demo Request"

### Architecture
- Page components split into server components (metadata) and client components (content) following Next.js App Router best practices
- New `src/components/pages/` directory for page-level client components
- New `src/components/visuals/RecoveryFlowVisual.tsx`

---

## [0.1.0] - 2026-04-11

Initial build: full two-page marketing site with dark premium aesthetic.

### Added
- **Design system**: dark-first enterprise palette (#0A0E1A background, #38BDF8 accent), Geist Sans font, TailwindCSS v4 theme tokens, Framer Motion animation variants
- **Layout components**: sticky glassmorphic Navbar with mobile hamburger, Footer with link columns, Button component (primary/secondary/ghost variants)
- **Reusable UI components**: SectionHeader, CTABlock, ValueCard, PillarCard, CapabilityCard, ProcessStep
- **Abstract visual components**: GridPattern (dot grid), NodeGraph (animated topology), HeroVisual (orbital system diagram) -- all SVG-based with Framer Motion
- **Homepage** with 7 sections: Hero, Problem Statement, Value Props, Why Now, Product Pillars, How It Works, Closing CTA
- **Platform/Product page** with 8 sections: Product Hero, Overview, Core Capabilities, Identity Assurance for Microsoft Entra, Data Assurance for Microsoft 365, How the Platform Works, Audience, Final CTA
- **Responsive design** across mobile (375px), tablet (768px), and desktop (1440px+)
- Next.js 16 App Router, TypeScript, TailwindCSS v4, Framer Motion

### Technical
- Zero external images -- all visuals are code-generated SVGs
- Smooth scroll, custom scrollbar, selection styling
- Accessible heading hierarchy, keyboard-focusable CTAs with visible focus rings
