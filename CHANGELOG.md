# Changelog

All notable changes to the KavachIQ Autonomous Assurance marketing site are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
