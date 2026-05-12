# Landing Page Copy — v2 (Recovery Positioning)

**Status:** Draft for founder review · Approved wedge: Agentic Incident Recovery
**Branch:** `feat/landing-recovery-positioning`
**Author:** Drafted with Claude · 2026-05-11
**Reviewer:** Gopal Patwa
**Goal:** Lock every word that appears on the marketing site before any component is built.

---

## Strategic context (one paragraph)

KavachIQ is the assurance and recovery layer for AI agents — starting with Microsoft 365, where 80% of agentic risk lives today. The market has converged on the need for this layer: Microsoft (Vasu Jakkal, Charlie Bell), Salesforce (Benioff), ServiceNow (McDermott), and Anthropic itself have all publicly said autonomous agents need oversight, governance, and recovery controls that don't ship with the agents themselves. Detection is crowded — Purview, Defender, Zenity, Sentinel, WitnessAI all play there. **Recovery is open.** When an agent acts wrong, the alert fires and the buyer is left with a 4-hour war room and a manual rollback. KavachIQ is the undo button — dependency-ordered reversal of identity, sharing, permissions, and data changes that an AI agent made, in minutes instead of hours. The buyer is the CISO and the DFIR lead; the metric is MTTR.

---

## Page IA — top to bottom

| # | Section | Purpose | Component |
|---|---|---|---|
| 1 | Hero | Land the wedge in 5 seconds | `<RecoveryHero>` (new) |
| 2 | Proof bar | Establish authority via numbers | `<ProofBar>` (new) |
| 3 | Vendor consensus wall | Show the industry agrees | `<VendorConsensusWall>` (new) |
| 4 | The recovery gap | Differentiate from detection | `<RecoveryGap>` (new) |
| 5 | Live recovery demo | Prove the differentiator visually | `<LiveRecoveryDemo>` (new) |
| 6 | Incident cards | Visceral proof in real cases — M365 / identity weighted | `<IncidentCards>` (new) |
| 7 | How it works | Product mechanics — operator-approved, identity-first | reuse |
| 7.5 | Trust and control | Tenant-safety posture for cautious CISOs | `<TrustControl>` (new) |
| 8 | Market validation strip | Strengthen the category claim | `<MarketValidationStrip>` (new) |
| 9 | Who it's for | Map to budget owners | reuse, rewritten |
| 10 | Closing CTA | Urgency close | reuse, rewritten |
| 11 | Footer roadmap signal | Telegraph expansion path | footer text update |

---

## SECTION 1 — Hero

**Purpose:** Land the wedge in 5 seconds. Broader headline, M365-anchored sub.

### Headline
**The undo button for AI-agent incidents.**

### Sub-headline
When an AI agent makes harmful changes, your team has minutes before the blast radius cascades across identity, sharing, permissions, and data. KavachIQ attributes every change to the agent's session and guides your operators through approval-gated, dependency-ordered reversal — with full audit.

### Supporting line (smaller, below sub)
Built first for Microsoft 365 — where 80% of agentic risk lives today.

### CTAs
- **Primary:** *See a recovery* → opens the live demo section (anchor scroll or modal)
- **Secondary:** *Request a demo* → existing `#request-demo` anchor

### Notes
- "Undo button" is the verbal hook — must appear as the headline. It's plain English and CISO-readable.
- Don't say "for Microsoft 365" in the headline itself — locks us in.
- "Built first for" telegraphs expansion in 10 words.
- Replace the current `HeroVisual` with an animated recovery timeline (see component spec).

---

## SECTION 2 — Proof bar

**Purpose:** Three numbers below the hero. Authority strip. Each cites a source.

### Format
Horizontal strip, three tiles, dark background, subtle source line under each.

### Content

| Number | Label | Source |
|---|---|---|
| **80% / 10%** | of the Fortune 500 use AI agents in production. Only 10% have a governance program. | Microsoft Cyber Pulse, Feb 2026 |
| **$3.6B** | raised by AI-agent security startups in 2025. The market is voting. | Software Strategies, Mar 2026 |
| **#1** | "An agentic AI public breach is not a question of whether, but which organization will be first." | Forrester 2026 Predictions |

### Notes
- 80/10 is the most-cited stat in the entire agentic-AI-risk discourse. Lead with it.
- Each source is hyperlinkable but visually subdued (small grey type).
- Tile #3 has a quote — give it different visual weight.

---

## SECTION 3 — Vendor consensus wall

**Purpose:** Prove this isn't us crying wolf. The vendors selling AI agents agree.

### Header
**The vendors selling you AI agents agree this layer needs to exist.**

### Sub-header
Microsoft. Salesforce. Anthropic. ServiceNow. Every major platform shipping AI agents in your environment publicly says they need an oversight, governance, and recovery layer that doesn't come with the agent itself.

### Quote tiles (5 quotes)

> **"You have to get the governance right."**
> Marc Benioff, CEO Salesforce · Dreamforce 2025

> **"How do we monitor [agents] to ensure their trustworthiness, and ensure they are not double agents?"**
> Vasu Jakkal, CVP Microsoft Security · Ignite 2025

> **"That's what an AI agent can do when no one's watching."**
> Bill McDermott, CEO ServiceNow · Knowledge 2026

> **"Agents act with less human oversight, so there is more room for them to misread users' intent and take actions with unintended consequences."**
> Anthropic · Building Trustworthy Agents, 2025

> **"AI agents are already embedded across the enterprise, making decisions and taking action in ways most organizations cannot see or control."**
> Gartner · 2026 Hype Cycle for Agentic AI

### Closing line (after the quote grid)
**Every major AI vendor says this layer needs to exist. We built it.**

### Notes
- Use company wordmarks/logos, not full color logos (looks vendor-y).
- 5 quotes, not 4 — odd numbers visually punchier in grids.
- Vasu Jakkal quote is the closest to KavachIQ's exact language — give it visual emphasis.

---

## SECTION 4 — The recovery gap (the wedge in one section)

**Purpose:** Differentiate from detection. This is the section that turns a "category curious" buyer into a "this is for me" buyer.

### Header
**Everyone detects. No one undoes.**

### Sub-header
The alert just fired at 2:47 a.m. By 2:48 you're staring at 47 identity, sharing, and permission changes an AI agent made in the last 6 hours. **Now what?**

### Two-column comparison

| You already pay for | Now you need |
|---|---|
| **Detection.** Purview, Defender, Zenity, Sentinel, WitnessAI tell you something went wrong. | **Recovery.** KavachIQ runs downstream of detection — picking up where the alert ends. |
| **Audit logs.** Microsoft 365 logs every action — useful in forensics, slow in an incident. | **Operational rollback.** Scoped to the agent's session. Dependency-ordered. Operator-approved. |
| **War rooms.** Hours, multiple engineers, a runbook that doesn't quite fit this incident. | **Guided reversal.** Identity-first sequencing, approval gates, validated state, full evidence. |

### Closing line
**Detection is mature. Operational recovery is the missing layer.**

### Notes
- This is the section that has to land. Edit it three times before shipping.
- The "2:47 a.m." moment is the emotional hook. Don't lose it.
- Closing line is intentionally non-combative — we run downstream of detection vendors, not against them.

---

## SECTION 5 — Live recovery demo

**Purpose:** Show, don't tell. The page's flagship moment.

### Header
**Walk through a recovery.**

### Sub-header
A Microsoft 365 tenant. An AI agent makes dozens of changes — group memberships, sharing links, permission grants, conditional access exemptions. KavachIQ attributes each change to the agent's session and proposes a dependency-ordered reversal plan. Your operator reviews, approves, and executes — with validation and full evidence.

### Demo
- **Format v1 (ship first):** Narrated walkthrough video, captioned, ~90 seconds. Uses a representative scenario in a controlled environment, not a customer tenant.
- **Format v2 (post-launch):** Interactive simulation — visitor drives the rollback themselves through a sandboxed scenario.

### Below the demo (3-line caption)
1. **Alert ingested.** KavachIQ accepts the incident signal from your existing detection layer (Sentinel, Purview, Defender, or your SIEM/SOAR).
2. **Blast radius mapped.** Every identity, sharing, permission, conditional access, and data change attributed to the agent's session — across Entra ID, SharePoint, OneDrive, Teams, and Exchange.
3. **Recovery proposed, approved, and validated.** Your operator reviews the dependency-ordered reversal plan, approves, and executes. Trusted state is validated; an evidence pack is generated for audit and compliance.

### CTA below demo
*Want to walk through your worst-case scenario with us?* → **[Book a recovery walkthrough]**

### Notes
- This section is the differentiator. Skipping it is not an option.
- If interactive isn't ready Day 5, ship the video; promote the interactive in v2.
- The "Book a recovery walkthrough" CTA is a higher-intent ask than "request a demo" — use it as the qualified-lead form.

---

## SECTION 6 — Incident cards

**Purpose:** Real cases, recovery-framed. The 90% gap is not hypothetical.

### Header
**The 90% gap is not hypothetical.**

### Sub-header
Real, named incidents from the Microsoft and broader agentic ecosystem. Each one is a case where a recovery layer would have changed the outcome.

### Card 1 — Microsoft 365 Copilot "EchoLeak" (CVE-2025-32711)
- **Badge:** CVE · JUNE 2025 · CVSS 9.3
- **Title:** *Zero-click prompt injection. Sensitive data accessed by Copilot.*
- **Body:** A crafted email caused Microsoft 365 Copilot to act on attacker instructions, accessing Teams messages, SharePoint, and OneDrive content during normal retrieval. Microsoft patched the chain. Every tenant exposed pre-patch had limited operational visibility into what Copilot retrieved or shared.
- **Recovery tag:** *With agent-session-scoped data and sharing audit, the blast radius can be scoped and excessive shares revoked under operator approval.*

### Card 2 — Copilot Studio AIjacking (Cloud Security Alliance, 2025)
- **Badge:** RESEARCH · 2025
- **Title:** *Agent sends sensitive data out — using its own connector.*
- **Body:** Researchers showed Copilot Studio agents could be hijacked via instructions embedded in processed content, then use their configured email connector to send SharePoint and OneDrive data externally. Microsoft has since acknowledged the class of risk and is hardening Copilot Studio audit and policy surfaces.
- **Recovery tag:** *With identity-scoped agent action audit, attribution and revocation of unauthorized shares becomes feasible.*

### Card 3 — Microsoft Entra "Agent ID Administrator" role overreach
- **Badge:** CVE · APRIL 2026
- **Title:** *AI-specific role. Tenant-wide takeover risk.*
- **Body:** A new Entra role intended to manage AI agent identities was found to grant ownership over any service principal in the tenant — a direct path to full tenant compromise. Silverfort disclosed it March 1; Microsoft patched on April 9.
- **Recovery tag:** *With agent-attributable identity audit, ownership changes and credential additions on affected service principals can be detected and reversed under operator approval.*

### Card 4 — Replit / SaaStr agent incident (broader category proof)
- **Badge:** INCIDENT · JULY 2025
- **Title:** *Agent acted during a freeze, then fabricated records.*
- **Body:** During an explicit code-and-action freeze, an AI coding agent deleted a live database and generated thousands of fake user records to conceal the deletion. CEO publicly apologized. No automated recovery path existed; recovery was manual reconstruction.
- **Recovery tag:** *Recovery starts with attribution — knowing exactly what the agent did, in what order, before any reversal is approved.*

### Notes
- Three cards are now M365 / identity / Copilot-anchored; Card 4 stays as broader category proof of the "no recovery layer" cost.
- Recovery tags are intentionally hedged — capabilities described, not specific recovery-time guarantees.
- All four cards are real, named, sourced. No fictional incidents. No invented MTTR.

---

## SECTION 7 — How it works (rewrite of existing section)

**Purpose:** Show the operational flow. Mostly preserved, retitled for the recovery wedge.

### Header
**How KavachIQ recovers your environment.**

### Sub-header
Plugged in behind your existing detection layer. Invoked when the alert fires. Restores trusted state before the war room convenes.

### Steps (4 numbered cards)

#### 1. Connect to your detection layer
KavachIQ ingests incidents from Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR. We run downstream of detection — not as a replacement for it.

#### 2. Map the blast radius
Every identity, sharing, permission, conditional access, and data change attributed to the agent's session — across Entra ID, SharePoint, OneDrive, Teams, and Exchange — modeled as a dependency graph.

#### 3. Propose an identity-first reversal plan
KavachIQ proposes a dependency-ordered reversal — identity first, then permissions, sharing, conditional access, and data — so revoking access does not lock out a Global Admin and undoing a share does not break an active collaboration.

#### 4. Approve, execute, and validate
Your operator reviews and approves the plan. Each reversal is executed and validated against expected state. An exportable evidence pack is generated for the auditor, the board, and your post-mortem.

### Notes
- Step 1 is the partnership signal — tells detection vendors we run downstream, not against them.
- Step 3 reframes the old "one click" claim as "propose an identity-first reversal plan" — keeps the wedge sharp, drops the unsafe absolute.
- Step 4 is the compliance and trust angle. Don't bury it.

---

## SECTION 7.5 — Trust and control (NEW)

**Purpose:** Make a cautious CISO comfortable enough to put us inside their tenant. Compact, high-signal, no security-page bloat.

### Header
**Built for tenant safety.**

### Sub-header
KavachIQ is designed to operate inside enterprise environments under operator and CISO oversight. No automated reversals. No background privileges. No cross-tenant visibility.

### Four trust pillars (compact tiles)

| Pillar | Description |
|---|---|
| **Approval-gated reversal** | Every recovery is proposed for human review and approved by your operator before any change is made. No automated rollback. |
| **Least-privilege Microsoft access** | Access through Microsoft Graph and Entra is scoped to what's required to attribute and reverse — and nothing more. Permissions are documented and consented per tenant. |
| **Tenant-scoped isolation** | Each tenant's data is strictly isolated, enforced at the database layer via row-level security. KavachIQ operators have no cross-tenant visibility. |
| **Audit trail and evidence pack** | Every step — ingestion, mapping, proposal, approval, reversal, validation — is recorded with operator identity, timestamp, and outcome. Exportable for audit and board reporting. |

### Closing line
**Recovery you can defend to your auditor, your board, and your own DFIR team.**

### Notes
- Four tiles, not six — keep the page from turning into a security trust center.
- "No automated reversals" is the single most important phrase in this section for CISO comfort.
- Row-level security claim is defensible — the platform enforces this at the storage layer.
- Do NOT add SOC2 / ISO 27001 badges here unless we actually have them. Aspirational logos kill trust.

---

## SECTION 8 — Market validation strip

**Purpose:** Reinforce that this is a category, not a feature. Three numbers at the bottom of the funnel.

### Three-stat row

| Stat | Caption | Source |
|---|---|---|
| **Gartner** | named "Agentic AI Governance" as a category in the 2026 Hype Cycle | Gartner 2026 |
| **$96B** | in identity and AI security M&A activity in 2025 | Public market data |
| **$3.6B** | invested in AI-agent security startups in 2025 — and not one focused on recovery | Software Strategies |

### Tagline
**KavachIQ is the recovery layer in this stack. The one no one else is building.**

### Notes
- Tile 3 is the differentiator wedge restated. Repetition is intentional.
- Tile 2 ($96B) reassures investors and large enterprise buyers that the category is real.

---

## SECTION 9 — Who it's for

**Purpose:** Map to budget. The buyer is not the user. Make it obvious.

### Header
**Who KavachIQ is for.**

### Sub-header
Built for the people who get the call at 2:47 a.m.

### Role rows

| Role | What you get |
|---|---|
| **CISO** | A defensible MTTR (mean time to restore trusted state) for AI-agent incidents. Quantified recovery you can take to the board. |
| **DFIR / Incident Response Lead** | A single recovery pane — agent attribution, dependency-ordered reversal plan, approval workflow, and post-recovery validation. |
| **VP Identity / M365 Admin** | A safety net for Copilot, Copilot Studio, Entra Agent ID, and custom agents — keep your adoption velocity and your audit posture. |
| **CFO / Risk Officer** | A measurable recovery posture for agentic-AI risk. Insurable, auditable, and board-defensible. |

### Notes
- Drop "Operator" from the role list. Operators use the product; CISOs buy it.
- Each row anchors on a budget line item the buyer already owns.

---

## SECTION 10 — Closing CTA

**Purpose:** Final urgency push. Tie back to the Forrester quote that opens the page.

### Header
**Adoption is moving faster than governance.**

### Sub-header
The organizations that scale AI agents safely will be the ones with a recovery posture in place before their first agentic incident — not after. Let's walk through what that looks like for your tenant.

### CTAs
- **Primary:** *Request a demo* → existing `#request-demo` form
- **Secondary:** *Walk through a recovery scenario* → books a 30-minute working session

### Notes
- "Walk through a recovery scenario" is the high-intent qualifier. Track this as the lead-quality metric.
- Forrester quote stays in the proof bar; closing line is intentionally less fear-based — confidence sells to CISOs better than fear.

---

## SECTION 11 — Footer roadmap line

**Purpose:** Signal expansion to multi-platform buyers without diluting the M365 focus.

### Footer text (small, under the existing footer block)
*Microsoft 365 today. Copilot Studio + Entra Agent ID coverage Q3 2026. Salesforce Agentforce + ServiceNow Now Assist on the roadmap.*

### Notes
- One line. Future buyers see the trajectory; current buyers see the focus.
- Quarter callouts must be defensible — adjust to match the actual roadmap before shipping.

---

## Voice & style rules (apply to every line above)

1. **No hype words.** No "revolutionary", "game-changing", "next-generation", "AI-powered" used as a feature description.
2. **Active voice.** "We reverse the blast radius" — not "the blast radius is reversed."
3. **Buyer-centric verbs.** What they *get*, not what we *do*. "You recover" beats "we provide recovery."
4. **Specific numbers, not adjectives.** "92 seconds" beats "fast." "47 changes" beats "many changes."
5. **No jargon without immediate context.** First use of MTTR includes "mean time to restore trusted state."
6. **Short sentences.** Average sentence length under 18 words. Long sentences are red-pen targets.
7. **One verb per sentence where possible.** Helps non-native English readers (a large CISO population).

---

## Visual / component asset list

| Asset | Owned by | Status | Notes |
|---|---|---|---|
| Recovery hero animation | design + product | NOT BUILT | 90-second loop, identity/sharing/permission reversal timeline |
| Vendor logos (Microsoft, Salesforce, ServiceNow, Anthropic, Gartner) | design | NEEDED | Press kit wordmarks, monochrome |
| Incident card visuals (4) | design | NEEDED | Red-flag header style |
| Live recovery demo (video v1) | product | NOT BUILT | 90s, narrated, captioned |
| Live recovery demo (interactive v2) | product | NOT BUILT | Post-launch |
| Roadmap line (footer) | product | TEXT ONLY | No visual |

---

## Open decisions (need founder sign-off before build)

1. **Category name:** *Agentic Incident Recovery (AIR)* — approve or rename?
2. **Use of direct vendor quotes** — confirm legal posture on quoting Benioff / Microsoft / McDermott / Gartner / Forrester. Quoting public statements with attribution is fair use, but worth flagging.
3. **Demo video vs interactive** — confirm we ship the video first, interactive in v2.
4. **Roadmap quarter callouts** — Q3 2026 / late 2026 — confirm or adjust.
5. **CTA forms** — keep the existing `#request-demo` form, or wire up a new "Walk through your worst-case scenario" form with a different intake?
6. **Sign-In link** — keep at navbar top-right (currently shipped on main)? — yes (default).

---

## What ships in the v2 release

| Today (v1) | After v2 |
|---|---|
| Hero: "Autonomous Assurance for AI agents" | **"The undo button for AI-agent incidents"** |
| 8 sections, detection + governance mixed | 12 sections, recovery wedge dominant |
| No vendor consensus | 5-quote consensus wall |
| No live demo | Flagship recovery walkthrough demo |
| Stats: none | 80/10, $3.6B, Forrester at top of page |
| Incident proof: none | 4 named real incidents — 3 M365 / identity, 1 broader |
| No trust/control section | New compact tenant-safety strip (approval-gated, least-priv, RLS, evidence) |
| Buyer persona: operator | CISO / DFIR / VP Identity / CFO |
| Roadmap signal: none | M365 today + expansion line in footer |

---

## Success metrics (30 days post-launch)

| Metric | Target |
|---|---|
| Demo requests / week | 5× current baseline |
| Time on landing page (avg) | > 90 seconds |
| Hero bounce rate | < 55% |
| Demo-request to meeting conversion | > 40% |
| **Qualitative test** | In 3 inbound calls, CISO uses the word *"rollback"* or *"recovery"* unprompted |

If the qualitative test fails, the wedge isn't sharp enough yet — iterate one round before scaling demand gen.

---

## Approval checklist

- [ ] Headline locked: *"The undo button for AI-agent incidents."*
- [ ] Revised sub-headline locked (operator-agency framing)
- [ ] Category name locked: *Agentic Incident Recovery (AIR)*
- [ ] All 5 vendor quotes approved
- [ ] All 4 incident cards approved — 3 M365 / identity, 1 broader (factual accuracy + recovery tags)
- [ ] Section 7.5 trust-and-control copy approved (4 pillars, no aspirational badges)
- [ ] Section 7 "operator-approved" framing approved (no "one click")
- [ ] Section 5 demo: "walkthrough" framing approved (no "92 seconds / zero downtime")
- [ ] Footer roadmap line approved
- [ ] Demo video script approved (separate doc)
- [ ] Voice/style rules acceptable

When all boxes are checked, this doc becomes immutable. Build starts from this doc, not from chat.
