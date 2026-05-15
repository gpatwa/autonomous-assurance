# Platform Page Copy — v1 (Recovery Positioning, Depth)

**Status:** Draft for founder review · Follows `LANDING_PAGE_COPY_V2.md` wedge
**Branch:** `feat/landing-recovery-positioning`
**Author:** Drafted with Claude · 2026-05-12
**Reviewer:** Gopal Patwa
**Goal:** Lock every word on `/platform` so it carries the same recovery wedge as the homepage, with product-depth content the homepage doesn't go into.

---

## Relationship to the homepage

The homepage answers: **"Why does this exist?"** → *The undo button for AI-agent incidents.*

The platform page answers: **"What does it do in my Microsoft 365 tenant?"** → *Here's the product. Here's the surface area it covers. Here's how it operates inside your environment.*

A CISO who's bought the homepage wedge clicks "Platform" / "Agentic Identity Recovery" / "Agentic Data Recovery" / "How It Works" in nav. The platform page is where they make the product-depth decision before requesting a demo. Tone: **less marketing, more operational specificity** — same wedge, more substance.

---

## Anchors that MUST be preserved (linked from Navbar + Footer)

- `#identity-assurance`
- `#data-assurance`
- `#how-it-works`
- `#platform-proof` (in-page only)

All four already exist on /platform today and must keep their IDs.

---

## Page IA — top to bottom

| # | Section | Anchor | Purpose | Component |
|---|---|---|---|---|
| 1 | Hero | — | Recovery-wedge framing for the depth page | `<PlatformHero>` (new) |
| 2 | Platform overview | — | The KavachIQ position in your existing stack | `<PlatformOverview>` (new) |
| 3 | The recovery surface | `#platform-proof` | What KavachIQ covers in M365 (Identity + Sharing + Permissions + CA + Data) | `<RecoverySurface>` (new) |
| 4 | Agentic Identity Recovery — deep dive | `#identity-assurance` | Entra-specific recovery depth | `<IdentityAssurance>` (new) |
| 5 | Agentic Data Recovery — deep dive | `#data-assurance` | SharePoint / OneDrive / Teams / Exchange recovery depth | `<DataAssurance>` (new) |
| 6 | How the platform operates | `#how-it-works` | 4-step operational flow (matches homepage) | `<PlatformHowItWorks>` (new) |
| 7 | Trust and tenant safety | — | Same 4 pillars as homepage, with deeper technical specificity | `<PlatformTrustControl>` (new) |
| 8 | Capabilities matrix | — | Operator-facing feature list — concrete, scannable | `<CapabilitiesMatrix>` (new) |
| 9 | Roadmap signal | — | M365 today → Copilot Studio + Entra Agent ID next → Salesforce + ServiceNow on the roadmap | `<PlatformRoadmap>` (new) |
| 10 | Closing CTA | — | Same intake as homepage, depth-page sub-copy | `CTABlock` (reused) |

---

## SECTION 1 — Hero

### Eyebrow
**Platform**

### Headline
**Operational recovery for AI-agent incidents in Microsoft 365.**

### Sub-headline (short, depth-page voice)
KavachIQ runs downstream of your detection layer. When an agent's actions land — across Entra, SharePoint, OneDrive, Exchange, Teams, Conditional Access, and DLP — KavachIQ attributes every change to the agent's session, proposes an identity-first reversal plan, and validates the result after operator approval.

### CTAs
- **Primary:** *Request a demo* → `#request-demo`
- **Secondary:** *See the recovery surface* → `#platform-proof` (in-page anchor)

### Notes
- Drop the old hero "Map blast radius. Recover safely." Replace with the on-wedge framing.
- Use `RecoveryFlowVisual` (existing) or a new visual showing the M365 surface map — depth page can carry a more diagrammatic visual than the homepage's animation.

---

## SECTION 2 — Platform overview

### Header
**Where KavachIQ sits in your stack.**

### Sub-header
Three layers, three jobs. KavachIQ is the layer you don't have yet.

### Three-column comparison

| Detection | Backup | **KavachIQ** |
|---|---|---|
| Microsoft Purview AI Observability, Defender for Cloud Apps, Microsoft Sentinel, Zenity, WitnessAI. | Microsoft 365 Backup, Rubrik, Cohesity, Veeam. | **Operational recovery** of the specific configuration and access changes an AI agent made. |
| Tells you something happened. | Restores data to a point in time. | Reverses only the agent's actions, in dependency order, with operator approval. |
| Alert source for KavachIQ. | Complementary — different blast radius, different remediation. | The missing layer between detection and trusted state. |

### Closing line
**Detection vendors and backup vendors are partners, not competitors. KavachIQ runs between them.**

### Notes
- Mirrors the homepage's "everyone detects, no one undoes" but with depth-page specificity: names the actual products in each adjacent category.
- Keep the closing line — it's the partner-posture signal we'd want a CISO to read out loud.

---

## SECTION 3 — The recovery surface

### Anchor
`#platform-proof`

### Header
**What KavachIQ recovers across your Microsoft 365 tenant.**

### Sub-header
Every agent-driven change in scope, mapped to the Microsoft surface it lives on. Recovery is dependency-ordered across all five.

### Five surfaces

| Surface | Examples of agent-driven change KavachIQ handles |
|---|---|
| **Identity** (Entra ID) | User membership in privileged groups · App registration and service principal ownership · Role assignments · Identity lifecycle changes |
| **Conditional Access** | Policy scope changes, exemptions added, sign-in risk thresholds modified, MFA bypass conditions |
| **Permissions** | Microsoft Graph delegated and application permissions · Site-level and item-level access grants · OAuth consent grants |
| **Sharing** | SharePoint and OneDrive external sharing links, anyone links, file and folder permissions, Teams channel sharing |
| **Data** | DLP label modifications, sensitivity label changes, retention label changes, content policy alterations |

### Closing line
**KavachIQ attributes each change to the agent's session. Reversal happens in identity-first order. Operators approve, then KavachIQ executes and validates.**

### Notes
- The five-surface table is the actual product surface area. Replaces the vague "backup / observability / governance" comparison on the current page.
- This is the section a buyer screenshots and sends internally.

---

## SECTION 4 — Agentic Identity Recovery (deep dive)

### Anchor
`#identity-assurance`

### Header
**Agentic Identity Recovery for Microsoft Entra.**

### Sub-header
The control plane is the highest-leverage place for an agent to do damage — and the lowest-leverage place to roll back without dependency awareness.

### Body
When an AI agent changes a user, modifies a group, alters an app registration, adds a service principal owner, or updates a Conditional Access policy, every downstream Microsoft 365 surface inherits the effect. A single service principal ownership change can expand access across the tenant. A single Conditional Access exemption can bypass MFA for an attacker's session.

KavachIQ scopes every identity change to the originating agent's session, models the downstream dependency graph, and proposes a reversal sequence that doesn't break the tenant — including not locking out a Global Admin, not invalidating active sessions, and not undoing legitimate changes that happened in the same window.

### What KavachIQ handles
- **Users and groups** — Membership in privileged groups, lifecycle changes, group ownership
- **Apps and service principals** — App registration creation and modification, service principal ownership, credential additions, OAuth consents
- **Conditional Access** — Policy scope and conditions, exemptions, sign-in risk thresholds, named locations
- **Roles** — Directory role assignments, eligible vs active assignments, scoped roles
- **Recovery order** — Identity first. Permissions next. Sharing and Data after.

### Notes
- Keep this section heavy on Microsoft Entra terminology — the buyer reading this knows the terms.
- Don't talk about "compliance" or "risk" here — that's homepage. Here, talk about the specific Entra surfaces.

---

## SECTION 5 — Agentic Data Recovery (deep dive)

### Anchor
`#data-assurance`

### Header
**Agentic Data Recovery for Microsoft 365.**

### Sub-header
Sharing, permissions, and data labels are where agent damage shows up to end users — and where uncoordinated rollback breaks active collaboration.

### Body
Once identity is restored, the data and collaboration surfaces need their own coordinated recovery. An agent that added external sharing links to a SharePoint site, modified DLP labels on a finance folder, or changed Teams channel permissions has done damage that can't be reversed by snapshot restore without losing the legitimate changes that happened alongside.

KavachIQ reverses the specific agent-driven changes on data and collaboration surfaces — preserving everything else. Reversal is sequenced after identity is restored, so re-granting access in the wrong order doesn't reintroduce risk.

### What KavachIQ handles
- **SharePoint and OneDrive** — External sharing links, site-level permissions, file and folder access grants, item-level overrides
- **Exchange** — Mailbox delegations, send-as permissions, inbox rules, transport rule changes
- **Teams** — Channel and team membership, channel permission changes, guest access, app installations
- **DLP and sensitivity labels** — Label modifications, policy scope changes, exception rules, retention label changes
- **Recovery posture** — Coordinated with identity restoration, dependency-ordered, operator-approved

### Notes
- The order matters: identity first (Section 4), then data (this section). Reinforce the sequence.
- Mention DLP labels by name — important for the Microsoft Purview-savvy buyer.

---

## SECTION 6 — How the platform operates

### Anchor
`#how-it-works`

### Header
**How the platform operates inside your tenant.**

### Sub-header
Same four-step flow as the homepage, with operator-grade detail.

### Four steps

#### 1. Connect to your detection layer
KavachIQ ingests incident signals from Microsoft Sentinel, Microsoft Defender for Cloud Apps, Microsoft Purview, or your SIEM/SOAR. We run downstream of detection — your existing alert posture stays in place. Integrations are configured per tenant via Microsoft Graph and a webhook from your SOAR.

#### 2. Map the blast radius
KavachIQ correlates the alert to the originating agent's session and walks the dependency graph across Entra ID, SharePoint, OneDrive, Teams, Exchange, Conditional Access, and DLP. Every change in the agent's window is attributed, classified, and graphed.

#### 3. Propose an identity-first reversal plan
The plan is dependency-ordered: identity changes first, then permissions, then sharing and conditional access, then data. The graph respects what depends on what — so revoking access does not lock out a Global Admin, and undoing a share does not break an active collaboration.

#### 4. Approve, execute, and validate
Your operator reviews the proposed plan and approves before any change is made. KavachIQ executes the reversal one step at a time and validates the result against expected state. The full operation — every step, every operator action — is recorded in an exportable evidence pack for the auditor, the board, and your post-mortem.

### Notes
- Same four steps as the homepage `HowItWorks` but with extra technical specificity (Microsoft Graph, webhooks, named M365 surfaces).
- Reuse the existing `ProcessStep` component.

---

## SECTION 7 — Trust and tenant safety

### Header
**Built for tenant safety.**

### Sub-header
KavachIQ operates inside enterprise environments under operator and CISO oversight. The same four pillars as the homepage — with the control posture spelled out.

### Four pillars (deeper than homepage)

| Pillar | What the homepage says | What `/platform` adds |
|---|---|---|
| **Approval-gated reversal** | Every recovery is proposed for human review before any change. No automated rollback. | Operators see the full proposed reversal — every step and its dependency — before any change runs. Approval is an explicit, scoped action; the platform does not act on its own. |
| **Least-privilege Microsoft access** | Scoped to what's required to attribute and reverse. | Microsoft Graph access is admin-consented per tenant and scoped to the surfaces under recovery management. Detailed permission scopes are available for procurement review on request. |
| **Tenant-scoped isolation** | Strict per-tenant data boundaries enforced at the database layer. | Tenant isolation is enforced at the data layer, with no shared tenant context across requests. Tenant-bound keys and access scopes prevent cross-tenant visibility. |
| **Audit trail and evidence pack** | Every step recorded with operator identity, timestamp, and outcome. | Each recovery produces an exportable evidence record covering the agent's actions, the proposed plan, every approval, and the validated result — suitable for audit, SIEM ingest, and board reporting. |

### Closing line
**Recovery you can defend to your auditor, your board, and your own DFIR team.**

### Notes
- The "what /platform adds" column is intentionally outcome-led, not architecture-led. Implementation specifics (RLS, signed evidence format, specific Entra identity provider, key-management primitives) belong in a security detail document or procurement deck, not on the public platform page.
- DO NOT add SOC 2 / ISO 27001 / FedRAMP badges unless we actually have them. Aspirational badges kill trust.
- Detailed scope lists, evidence schema, and identity-provider specifics are available for serious procurement conversations — not on the public page.

---

## SECTION 8 — Capabilities matrix

### Header
**What operators get.**

### Sub-header
What KavachIQ delivers to operators day-to-day.

### Capability list (10 short items, scannable)

- **Agent-session correlation** — Every change in an agent's session is attributed back to it, with the supporting Microsoft 365 audit trail attached
- **Cross-domain blast radius graph** — Identity, sharing, permissions, Conditional Access, DLP, and data modeled as a single dependency graph per incident
- **Dependency-ordered reversal plans** — Recovery proposals respect what depends on what, so reversal does not leave the tenant in an inconsistent state
- **Operator approval workflow** — Plans are proposed for review, not executed automatically. Operators approve before any change is made
- **Post-reversal validation** — Each step is checked against expected state and any mismatch is surfaced before sign-off
- **Exportable recovery evidence** — A complete, exportable record of every operation, suitable for audit review, SIEM ingest, and board reporting
- **Detection-layer ingestion** — Subscribes to your existing detection (Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR) as the alert source
- **Documented Microsoft Graph access** — Scoped, admin-consented per tenant; detailed scope inventory available on request
- **Tenant-scoped isolation** — Per-tenant data and access boundaries enforced at the data layer, with tenant-bound key material
- **Audit-grade incident timeline** — A chronological record of agent action → ingestion → mapping → approval → reversal → validation, anchored to verifiable enterprise identity

### Notes
- Trimmed from 12 to 10 — each line should feel like value the operator gets, not an implementation claim.
- Implementation specifics (signed-JSON format, key-management primitives, exact identity provider, database-engine RLS) are folded into outcome language: "exportable evidence", "tenant-bound key material", "verifiable enterprise identity", "data layer". Detail belongs in procurement materials, not on the public page.
- DO NOT promote items to overstate shipped status. Each line should map to a capability we can demonstrate end-to-end on a discovery call.

---

## SECTION 9 — Roadmap signal

### Header
**Microsoft 365 today. More agent surfaces over time.**

### Sub-header
KavachIQ's recovery model extends past M365 — but only after we've earned the right.

### Three rows

| Stage | What it covers | Status |
|---|---|---|
| **Today** | Microsoft Entra + Microsoft 365 (SharePoint, OneDrive, Teams, Exchange, Conditional Access, DLP) | Shipped |
| **Q3 2026** | Copilot Studio agents · Entra Agent ID coverage · Custom-agent attribution via Microsoft Graph | In progress |
| **Late 2026** | Salesforce Agentforce · ServiceNow Now Assist · Adjacent agent platforms | On the roadmap |

### Closing line
**Each platform earns its place by depth, not breadth. We do M365 better than anyone before we add anything else.**

### Notes
- Quarter callouts must be defensible — adjust to match the actual roadmap before shipping.
- The closing line is the "M365-first specialist" stake — important to repeat across the depth page.

---

## SECTION 10 — Closing CTA

Reuse the existing `CTABlock` with depth-page sub-copy.

### Headline
**Walk through the platform with us.**

### Body
We'll show you how KavachIQ runs inside a Microsoft 365 tenant — alert ingestion, blast radius mapping across all five surfaces, identity-first reversal proposal, operator approval, validation, and the evidence pack. Bring a scenario; we'll walk it.

### CTA text
**Request a demo**

### Notes
- Use the existing `#request-demo` form. No new intake.
- The body says "Bring a scenario; we'll walk it" — that's the high-intent qualifier.

---

## Voice & style rules (same as homepage)

1. **No hype words.** No "revolutionary", "next-generation", "AI-powered" as a feature description.
2. **Active voice.** "We attribute every change" — not "every change is attributed."
3. **Buyer-centric verbs.** What they get, not what we do.
4. **Specific numbers and named products.** "Microsoft Graph permission `AuditLog.Read.All`" beats "audit log permissions."
5. **No jargon without immediate context.** First use of RLS expands to "row-level security."
6. **Short sentences.** Average under 18 words.
7. **Depth-page tone is more operational than marketing.** This is the page a buyer reads with a notebook.

---

## What's preserved from today's `/platform`

- All four anchor IDs (`#platform-proof`, `#identity-assurance`, `#data-assurance`, `#how-it-works`)
- Existing `RecoveryFlowVisual` (can be reused or replaced — design call)
- Existing `CapabilityCard` and `ProcessStep` primitives
- Existing `CTABlock` form intake at `#request-demo`

## What gets replaced

- All hero copy
- "Why existing tools fall short" 4-tile comparison (replaced by 3-column platform overview)
- All capability descriptions (rewritten to recovery-wedge framing)
- All deep-dive section bodies (rewritten with specific M365 surface names)
- All section eyebrow labels ("Platform proof" → "The recovery surface", etc.)
- All CTA copy
- "Platform vision" section (replaced by clearer roadmap signal)

---

## Open decisions (need founder sign-off before build)

1. **Hero visual** — keep `RecoveryFlowVisual` or build a new surface-map diagram?
2. **Capabilities list (10 items)** — confirm each line is demonstrable on a discovery call. The new wording is outcome-led rather than implementation-specific, but each capability still has to be real.
3. **Roadmap quarter callouts** — Q3 2026 / late 2026 — confirm or adjust
4. **Procurement deck for security depth** — the public page now keeps trust claims outcome-led. Detail (signed-evidence schema, key-management specifics, exact identity provider, RLS implementation) belongs in a procurement-only doc. Confirm a procurement deck exists, or commission one.
5. **Section 8 format** — `CapabilityCard` grid (existing primitive) or tighter list format?
6. **Connected systems / Platform vision section** — keep something like the old "Connected systems expansion" or fold into Section 9?

---

## What ships in v1 release

| Today (live) | After v1 |
|---|---|
| Hero: "Map blast radius. Recover safely." | **"Operational recovery for AI-agent incidents in Microsoft 365."** |
| "Autonomous Assurance" terminology | **Recovery-wedge terminology, matching the homepage** |
| Why-tools-fall-short 4-tile | **Detection / Backup / KavachIQ 3-column overview** |
| Generic capabilities cards | **10-item capability list — concrete, scannable, outcome-led** |
| Identity-first text-only | **Identity-first depth with named Entra surfaces** |
| Data-first text-only | **Data-first depth with named M365 surfaces** |
| No trust section | **Trust & tenant safety — homepage 4 pillars + outcome-led control posture (procurement detail kept off the public page)** |
| Vague "Platform vision" | **Concrete roadmap with named platforms and stages** |
| CTA body "identity-first recovery" | **"Walk through the platform with us. Bring a scenario."** |

---

## Approval checklist

- [ ] Hero headline locked: *"Operational recovery for AI-agent incidents in Microsoft 365."*
- [ ] Section 2 platform overview 3-column comparison approved
- [ ] Section 3 five-surface table approved (Identity / CA / Permissions / Sharing / Data)
- [ ] Agentic Identity Recovery deep-dive content approved
- [ ] Agentic Data Recovery deep-dive content approved
- [ ] How It Works 4 steps approved
- [ ] Trust & tenant safety pillars approved (outcome-led wording; implementation specifics live in a separate procurement doc)
- [ ] Capabilities matrix — final list of 10 outcome-led items locked, each demonstrable on a discovery call
- [ ] Roadmap callouts approved
- [ ] Closing CTA body approved
- [ ] All anchor IDs preserved (`#identity-assurance`, `#data-assurance`, `#how-it-works`, `#platform-proof`)

When all boxes checked, this doc becomes immutable. Build starts from here.

---

## Section-to-component plan

```
src/components/sections/platform/
  PlatformHero.tsx
  PlatformOverview.tsx
  RecoverySurface.tsx
  IdentityAssurance.tsx
  DataAssurance.tsx
  PlatformHowItWorks.tsx
  PlatformTrustControl.tsx
  CapabilitiesMatrix.tsx
  PlatformRoadmap.tsx
```

Then `src/components/pages/PlatformPageContent.tsx` becomes a clean orchestrator (~25 lines) like `HomePageContent.tsx`.

Reuse: `Button`, `SectionHeader`, `ProcessStep`, `CapabilityCard`, `CTABlock`, `GridPattern`, motion/animations, the recovery-walkthrough visual.
