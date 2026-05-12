# Competitive Positioning — v1

**Status:** Draft for founder review · Internal sales / GTM reference
**Branch:** `feat/landing-recovery-positioning`
**Author:** Drafted with Claude · 2026-05-11
**Reviewer:** Gopal Patwa
**Goal:** Give a sales team, founder, or analyst-briefer exactly what to say in every competitive scenario. One source of truth.

---

## TL;DR — the 30-second version

KavachIQ sits in a new gap the existing security stack has not filled: **Agentic Incident Recovery (AIR)**. Detection vendors (Purview, Defender, Sentinel, Zenity, WitnessAI) tell you something went wrong. Backup vendors (Rubrik, Cohesity, Veeam, Druva, M365 Backup) restore data to a point in time. Neither **reverses the specific actions an AI agent took** without collateral damage to legitimate work.

The one-line pitch versus every category:

| Category | Their job | Our job | One-liner |
|---|---|---|---|
| **Backup** | Restore data to yesterday | Reverse the agent's actions | *Rubrik is backup. KavachIQ is undo.* |
| **Detection / SIEM** | Alert you something happened | Take it back | *Sentinel alerts. KavachIQ acts.* |
| **Agent governance** | Watch the agent | Recover from the agent | *Zenity monitors. KavachIQ remediates.* |
| **Microsoft native** | Audit logs and policies | Operational rollback | *Purview tells you what happened. KavachIQ undoes it.* |
| **ServiceNow** | Ticket the incident | Reverse it before the ticket is read | *ServiceNow opens the ticket. KavachIQ closes it.* |

Three sticky soundbites:

1. **"Backup is restore-to-yesterday. KavachIQ is undo-this-agent's-last-six-hours."**
2. **"Detection vendors don't lose this fight. They never showed up to it."**
3. **"Microsoft built the alert. We built the undo button."**

---

## The competitive map

KavachIQ touches five adjacent categories. Each has different overlap, different threat level, and a different sales motion.

```
                    ┌─────────────────────────────────────────────┐
                    │       AGENTIC INCIDENT RECOVERY (us)        │
                    └─────────────────────────────────────────────┘
        ┌───────────────────┼────────────────────┬─────────────────────┐
        ▼                   ▼                    ▼                     ▼
  ┌──────────┐       ┌─────────────┐      ┌─────────────┐       ┌──────────┐
  │  BACKUP  │       │ DETECTION/  │      │   AGENT     │       │ MICROSOFT │
  │   /CYBER │       │   SIEM      │      │ GOVERNANCE  │       │  NATIVE   │
  │ RESILIENCE│      │   /XDR     │      │             │       │           │
  └──────────┘       └─────────────┘      └─────────────┘       └──────────┘
  Rubrik              Sentinel             Zenity              Purview
  Cohesity            Defender             WitnessAI           Entra Agent ID
  Veeam               CrowdStrike          ServiceNow AI       Agent Gov Toolkit
  Druva               Wiz                  Salesforce TL       M365 Backup
  M365 Backup         Palo Alto AI-SPM     Aembit / Astrix     Defender
```

**Threat level (1 = mild, 5 = existential):**

| Category | Threat | Why |
|---|---|---|
| Microsoft native | 5 | Owns the platform, the buyer, the data, and the alert source |
| Backup / Cyber Resilience | 4 | Brand recognition, CISO budget, "we already have it" objection |
| Agent governance startups | 3 | Closest functional overlap, but most are still in "monitor" mode |
| ServiceNow AI Control Tower | 3 | C-suite mindshare, free for a year, "agent of agents" claim |
| Detection / SIEM | 1 | Partner, not competitor — they are the alert source |

---

# CATEGORY 1 — Backup / Cyber Resilience

The most active competitive surface today. CISOs already pay for these vendors and ask "isn't this just backup?" in every demo.

## 1a. Rubrik

- **What they are:** Public cyber resilience company, ~$11B market cap. Rubrik Security Cloud, Identity Resilience, M365 backup.
- **What they say:** *"Zero Trust Data Security. Restore from ransomware in minutes."*
- **Most relevant product:** **Rubrik Identity Resilience** (launched 2024) — periodic snapshots of Entra ID / Active Directory; restore identity objects to a point in time after an attack.
- **Where they overlap:** Identity restore in Entra ID. The closest single competitor to KavachIQ.

### Where they fall short

| Dimension | Rubrik Identity Resilience | KavachIQ |
|---|---|---|
| Recovery primitive | Point-in-time snapshot of identity objects | Action-scoped reversal of agent's changes |
| Granularity | Restore object, lose intermediate changes | Reverse only the bad actions; keep good work |
| Cross-domain | Identity only (separate Rubrik products for data) | Identity + sharing + permissions + DLP + CA together |
| Latency | Bound to snapshot window (hours) | Live tenant state |
| Agent attribution | None — object-level only | Session-level with prompt + tool-call evidence |
| Deployment | Backup appliance + integration | 10-minute Entra consent flow |

### Battle card — vs Rubrik

| If the customer says... | Reply |
|---|---|
| *"We already have Rubrik."* | *"Rubrik backs up your data. KavachIQ reverses the actions your AI agent took. Different jobs. Most customers run both."* |
| *"Rubrik does Identity Resilience now."* | *"Identity Resilience restores Entra to a point in time — which loses every legitimate change since the snapshot. KavachIQ reverses only the agent's actions and preserves the rest."* |
| *"Why two recovery vendors?"* | *"Because they're recovering from different things. Ransomware? Rubrik. AI agent error? KavachIQ. Different blast radius, different remediation."* |
| *"Rubrik is cheaper."* | *"Rubrik bills you for storage. KavachIQ bills you for an operation backup vendors can't perform — agent-scoped, dependency-ordered reversal. Compare cost-per-incident-recovered, not cost-per-GB."* |

### Win conditions vs Rubrik
- Demo where you reverse 47 changes in 92 seconds and Rubrik's roll-back loses 12 hours of unrelated work
- CISO has already had an agent-error incident and felt the gap
- Compliance/audit requirement to show *which changes* were reversed (Rubrik can't itemize)

### Lose conditions vs Rubrik
- CISO sees "recovery" budget already spent on Rubrik and has no slot for a second vendor
- Procurement consolidates security spend; new vendors get pushed out
- Rubrik bundles a future "Agent Recovery" SKU as a free add-on

### Strategic posture
**Complementary, not replacement.** Co-sell over compete. Build a Rubrik integration that imports Rubrik's identity snapshots as a fallback for changes we can't surgically reverse. Get listed in Rubrik's marketplace.

---

## 1b. Cohesity (incl. Veritas, post-merger)

- **What they are:** Backup and data management giant, ~$7B+. Acquired Veritas 2024.
- **What they say:** *"AI-ready data security. From backup to AI-era cyber resilience."*
- **Most relevant product:** **Cohesity DataHawk** (cyber resilience + classification) and **Gaia** (AI assistant for data).
- **Where they overlap:** Indirect. Cohesity is data-first, not identity-first.

### Battle card — vs Cohesity

| If the customer says... | Reply |
|---|---|
| *"Cohesity handles our M365 backup."* | *"Good. Cohesity restores files. The 47 changes a Copilot agent made — group memberships, sharing links, conditional access exemptions — those aren't files. Cohesity can't see them."* |
| *"DataHawk catches anomalies."* | *"DataHawk detects. KavachIQ reverses. Different layer of the stack."* |

### Strategic posture
**Ignore until they show up in a deal.** Cohesity is wide and shallow on M365 — they don't yet have a strong Entra / Copilot story. Revisit in 18 months.

---

## 1c. Veeam

- **What they are:** Backup specialist; recently acquired CoveWare for ransomware response.
- **Most relevant product:** Veeam Backup for Microsoft 365 — mailbox, OneDrive, SharePoint, Teams backup.
- **Strategic posture:** Same as Cohesity. Pure backup, not agent recovery. Position as complementary.

---

## 1d. Druva

- **What they are:** Cloud-native backup, focused on M365 and endpoint.
- **Strategic posture:** Identical to Veeam. Backup vendor, not action recovery.

---

## 1e. Microsoft 365 Backup (native)

- **What it is:** Microsoft's first-party M365 backup product, GA 2024. $0.15/user/month — extremely cheap.
- **Why it matters:** Commoditizes the simple "backup M365" pitch. Every backup vendor (Rubrik, Cohesity, Veeam) has to differentiate above this floor.
- **Where it falls short for us:** Pure data restore. No identity actions, no agent attribution, no cross-domain awareness.

### Battle card — vs M365 Backup

| If the customer says... | Reply |
|---|---|
| *"We already have Microsoft 365 Backup for $0.15/user."* | *"Microsoft 365 Backup is data restore. KavachIQ is operational rollback of agent actions. M365 Backup can't tell you what your Copilot agent changed yesterday — let alone undo it."* |

---

# CATEGORY 2 — Microsoft Native (the existential threat)

Microsoft is your biggest channel and your biggest competitor. Every product they ship in this space is a direct hit on your roadmap.

## 2a. Microsoft Purview AI Observability

- **What it is:** Audit and policy enforcement for M365 Copilot, Copilot Studio, and other M365 AI agents. Shipped 2025.
- **Their pitch:** *"Observability and governance for your AI agents."*
- **Where they overlap:** Detection and audit — KavachIQ ingests Purview alerts.
- **Where they fall short:** Pure detection. No undo button. Tells you what the agent did, not how to reverse it.

### Battle card — vs Purview

| If the customer says... | Reply |
|---|---|
| *"Microsoft Purview tells us what Copilot did."* | *"Exactly. KavachIQ takes Purview's alert and reverses the cascade. Purview is your alert source. We're the operational layer downstream."* |
| *"Why not wait for Microsoft to build recovery?"* | *"Microsoft will. In 18–24 months. And only for Entra. The cross-domain dependency graph — identity + sharing + DLP + CA — is a multi-team effort that crosses product lines inside Microsoft. KavachIQ has it today."* |

### Strategic posture
**Partner, partner, partner.** Build the Sentinel + Purview + Defender connectors first. Be downstream of Microsoft's detection layer. The day a customer says "we use Microsoft detection" should be the day you win the deal.

---

## 2b. Microsoft Entra Agent ID

- **What it is:** AI agent identity management in Entra. Shipped 2025.
- **Their pitch:** *"Manage AI agent identities like employee identities."*
- **Where they overlap:** Indirect. They issue and manage agent identities; we react when those agents misbehave.
- **Where they fall short:** Identity-only, no remediation. The April 2026 "Agent ID Administrator" CVE proves Microsoft's own AI identity surface has gaps.

### Battle card — vs Entra Agent ID

| If the customer says... | Reply |
|---|---|
| *"We use Entra Agent ID for agent identity."* | *"Perfect. KavachIQ reads from Entra Agent ID to attribute every action to the correct agent session. They're complementary."* |

---

## 2c. Microsoft Agent Governance Toolkit (open-source, April 2026)

- **What it is:** Open-source runtime security toolkit for AI agents, addressing all 10 OWASP Agentic AI risks. Free.
- **Their pitch:** *"Production-ready security controls for AI agents — open source."*
- **Where they overlap:** Detection and guardrails. Not recovery.
- **Where they fall short:** Toolkit, not product. Customer has to assemble, deploy, and operate it themselves. Zero managed-service value.

### Battle card — vs Agent Governance Toolkit

| If the customer says... | Reply |
|---|---|
| *"Microsoft open-sourced an agent governance toolkit. Why pay you?"* | *"That toolkit is detection guardrails — same category as Purview. It still doesn't undo anything. And it's an SDK, not a product. KavachIQ is the operational layer on top — for the day one of your agents does something the guardrails missed."* |

### Strategic posture
**Microsoft's toolkit validates the category. It does not threaten KavachIQ.** Detection guardrails are not undo. Use the toolkit's existence in pitches: *"Even Microsoft's own toolkit doesn't have recovery."*

---

## 2d. Microsoft Sentinel / Defender for Cloud Apps

- **What they are:** SIEM/SOAR (Sentinel) and CASB (MDCA).
- **Strategic posture:** **Strict partner.** Sentinel is the most important integration on the roadmap. Build the Sentinel connector before any other competitive feature.

---

# CATEGORY 3 — Agent Governance & Observability Startups

The "closest functional competition." Heavily funded in 2025. Most are still in detection/observability mode.

## 3a. Zenity

- **What they are:** AI agent observability and runtime threat protection. Named in Gartner 2026 Hype Cycle for Agentic AI.
- **Their pitch:** *"Trust AI agents. Detect prompt injection, scope violations, data exfiltration."*
- **Where they overlap:** Detection of agent misbehavior. Same alert source category as Purview.
- **Where they fall short:** Same gap as Purview — they detect, they don't undo.

### Battle card — vs Zenity

| If the customer says... | Reply |
|---|---|
| *"We use Zenity to monitor our agents."* | *"Great. Zenity catches the behavior. KavachIQ reverses the damage. Zenity is your alert source — we operate downstream."* |
| *"Zenity has remediation."* | *"Zenity's 'remediation' is policy enforcement at the prompt level — they can block a future action. They can't reverse what already happened. KavachIQ rolls back the cascade after the fact."* |

### Strategic posture
**Partner if possible; otherwise out-execute on M365 depth.** Zenity is broad (any agent platform); KavachIQ is deep (M365 dependency graph). Build a Zenity connector; let them be the alert source.

---

## 3b. WitnessAI

- **What they are:** AI agent security platform. $58M raised (Forgepoint, Sound Ventures).
- **Strategic posture:** Same as Zenity — detection layer, not recovery. Watch but don't fight.

---

## 3c. ServiceNow AI Control Tower

- **What it is:** Multi-platform agent governance. Discovers, monitors, governs agents across AWS, Azure, GCP, SAP, Oracle, Workday, M365.
- **Their pitch:** *"We are the AI agent of the agents. Free for one year."*
- **Where they overlap:** Inventory + monitoring of agents. Workflow + ticketing.
- **Where they fall short:** ServiceNow does workflow, not domain semantics. They will alert and ticket. They will not safely reverse a 200-permission cascade in Entra.

### Battle card — vs ServiceNow

| If the customer says... | Reply |
|---|---|
| *"ServiceNow does AI agent governance now."* | *"ServiceNow opens a ticket. KavachIQ reverses the cascade before the ticket is read. ServiceNow needs a human in the workflow. We don't."* |
| *"ServiceNow is free for a year."* | *"And worth every penny if all you need is an inventory list. Cross-domain rollback in M365 — identity, sharing, DLP, CA — isn't on ServiceNow's roadmap."* |
| *"Bill McDermott said ServiceNow is the agent of the agents."* | *"He's right — for ticketing and workflow. We're the operational arm. ServiceNow tickets the incident; we resolve it."* |

### Strategic posture
**Partner with ServiceNow's incident workflow.** Build a ServiceNow incident-table integration: alerts that fire in ServiceNow can trigger a KavachIQ recovery and post status back. Coexist; don't compete on inventory.

---

## 3d. Salesforce Einstein Trust Layer / Agentforce

- **What it is:** Salesforce-only agent governance.
- **Strategic posture:** Irrelevant for now. M365 is your wedge. Salesforce expansion is a 2027 conversation.

---

# CATEGORY 4 — Non-Human Identity (NHI)

A sub-category that has emerged in 2024–2025. Lots of funding. Different problem.

## 4a. Aembit · Oasis Security · Astrix · Defakto · Keycard

- **What they are:** Identity governance for non-human accounts — service principals, machine identities, agent identities.
- **Funding:** Oasis $120M, Defakto $30.75M, Keycard $38M (a16z), Astrix and Aembit similar.
- **Their pitch:** *"You manage human identities. We manage the 50× more machine identities."*
- **Where they overlap:** Both deal with agent identity at some level.
- **Where they differ:** They are IGA-flavored — provisioning, rotation, revocation. KavachIQ is incident-flavored — reverse what an agent did.

### Battle card — vs NHI vendors

| If the customer says... | Reply |
|---|---|
| *"We use Oasis Security for non-human identities."* | *"Oasis governs the agent identity. KavachIQ governs what the agent did. Different layers — you need both."* |

### Strategic posture
**Adjacent, not competitive.** Build an integration path: NHI vendors tell us which identities are agents; we tell them what those agents did. Cross-sell opportunity.

---

# CATEGORY 5 — Adjacent (SIEM, SOAR, CSPM)

Partners, not competitors. Critical integrations.

| Vendor | Role | Integration priority |
|---|---|---|
| **Splunk** | SIEM | Sentinel first; Splunk Q4 2026 |
| **CrowdStrike (+SGNL)** | EDR + access orchestration | Major partner — SGNL acquisition validates the access-orchestration thesis |
| **Wiz** | CSPM expanding to AI-SPM | Adjacent; possibly partner via Wiz Defend in 2027 |
| **Palo Alto AI-SPM** | AI security posture | Adjacent; Palo Alto's Prisma Cloud could be a customer or a competitor depending on their AI roadmap |
| **SailPoint / Saviynt** | Identity Governance | Long-term partner — IGA + agent recovery is a natural pairing |

**Strategic posture for this category:** Get listed in every major SIEM/SOAR/CSPM marketplace within 90 days of launch. Be the recovery action in everyone's incident response playbook.

---

# Win themes (the five soundbites)

These should be repeated until they are reflexes for the sales team.

1. **"Backup restores yesterday. KavachIQ reverses six hours of agent actions — and keeps everything else."**

2. **"Detection vendors don't lose this fight. They never showed up to it."**

3. **"Microsoft built the alert. We built the undo button."**

4. **"ServiceNow opens the ticket. We close it before anyone reads it."**

5. **"You already pay for detection. You already pay for backup. You haven't paid for the layer that exists between them."**

---

# Battle cards — the "if they say X" universal reference

A single table sales can pin on the wall.

| Objection | Response |
|---|---|
| *"We already have Rubrik."* | Rubrik is backup. KavachIQ is undo. Pair them. |
| *"We have Microsoft 365 Backup."* | $0.15/user is data restore — not action reversal. Different job. |
| *"Purview/Defender already monitors Copilot."* | Detection is the alert source. KavachIQ ingests it and reverses the cascade. |
| *"Microsoft's open-source toolkit does this."* | The toolkit is guardrails — same as Purview. Still no undo button. |
| *"Zenity / WitnessAI does this."* | They detect and block at prompt. They don't reverse post-action damage. |
| *"ServiceNow AI Control Tower is free."* | ServiceNow tickets. We act. Different operation. |
| *"Microsoft will build this."* | Microsoft will build it in Entra alone. Cross-domain (Entra + SharePoint + DLP + CA) is a multi-team Microsoft effort that takes 2+ years. |
| *"We can just write a runbook."* | Show us a runbook that reverses 47 changes in dependency order in under 2 minutes. We'll wait. |
| *"Isn't it dangerous to give a vendor undo permissions?"* | KavachIQ doesn't have free undo — every reversal is dependency-validated, evidence-signed, and human-approval-gated by default. The runbook is the alternative, and it's worse. |
| *"We don't have agent incidents yet."* | 53% of orgs had AI agents exceed permissions in the last 12 months. 82% have agents they don't know about. The first incident is when the budget materializes — be ready before then. |
| *"We're early in our agent journey."* | Perfect time to put the recovery layer in. Adoption accelerates whether or not you have it. |
| *"What's your ROI?"* | One incident avoided pays for the product. A 13-hour outage at AWS scale is in the millions; a Replit-style fabrication incident took a CEO public apology. We replace those outcomes with a 92-second rollback. |

---

# Pricing posture

**Don't compete on price with backup vendors. Compete on budget line.**

| Comp budget line | KavachIQ posture |
|---|---|
| Backup ($GB-based, multi-million annual) | Not your budget. |
| Detection / SIEM | Not your budget. |
| **Incident response / DFIR retainer** | **Your budget.** Mandiant, CrowdStrike retainer, Kroll. |
| Identity governance (Sailpoint/Saviynt) | Adjacent. Can co-sell. |
| **Cyber insurance** | **Your budget.** Insurers will demand agent recovery in 2027 policies. Land here. |

### Recommended pricing model (placeholder — needs market test)

- **Starter:** Per-tenant subscription. ~$50–80K/year for one M365 tenant up to 10K users.
- **Enterprise:** Multi-tenant + premium IR retainer + analyst-grade evidence pack. ~$200K–$500K/year.
- **DFIR partnership tier:** White-labelable for Mandiant / CrowdStrike / Kroll partners.

The pricing message: *"Land in the IR budget. Don't try to win the backup budget."*

---

# Defensive moves — what competitors will do in 18 months

| Vendor | Likely move | Our defense |
|---|---|---|
| **Rubrik** | Ship "Agent Action Recovery" — agent-session correlation on top of Identity Resilience | Win named customers fast. Build the cross-domain graph that's hardest to replicate. Stay M365-deeper than them. |
| **Microsoft** | Ship "Entra Rollback" or "Purview Recovery" as a feature | Be cross-domain (Entra + SharePoint + DLP + CA). Microsoft's product lines don't orchestrate. |
| **ServiceNow** | Acquire a backup vendor or build action recovery into AI Control Tower | Partner with their workflow; don't try to win mindshare on inventory |
| **Zenity / WitnessAI** | Add "post-incident remediation" features | Out-deepen them on M365 semantics; they're broad-and-shallow |
| **A new startup** | Direct clone of KavachIQ | First mover advantage + first 5 named customers = moat for 18 months |

The window to win is 12–18 months. After that, the category consolidates around 2–3 winners.

---

# Strategic narrative for analyst briefings (Gartner, Forrester, IDC)

When briefing analysts, lead with the **category gap**, not the product.

> "There is a layer of the agentic security stack that does not yet have a vendor: post-incident action recovery. Detection is mature — every CISO has Purview, Defender, or Sentinel. Backup is mature — every CISO has Rubrik, Cohesity, or M365 Backup. But neither of those layers can reverse the specific changes an AI agent made without rolling back legitimate work alongside them. This is the gap we call Agentic Incident Recovery, or AIR. We are the first vendor purpose-built for it."

Asks for analyst briefings:

1. Coin **"Agentic Incident Recovery (AIR)"** as a named category in your next Hype Cycle / Wave
2. Acknowledge this is distinct from backup, distinct from detection, distinct from governance
3. Profile KavachIQ as a Cool Vendor / Sample Vendor in the next agentic AI report
4. Connect us with 2–3 reference CISOs for input on the category definition

---

# Partnership map — who to partner with (not fight)

| Partner type | Vendors | Why partner |
|---|---|---|
| **Alert source** | Microsoft Sentinel, Purview, Defender, Zenity, WitnessAI | They detect; we recover. We need their alert webhooks. |
| **Identity governance** | SailPoint, Saviynt, Aembit, Oasis, Astrix | Non-human identity is adjacent. Co-sell. |
| **DFIR retainer** | Mandiant, CrowdStrike Services, Kroll, FireEye | Become their preferred recovery tooling. White-label tier. |
| **Backup (eventually)** | Rubrik, Cohesity | After 18 months of brand. Co-sell as complement. |
| **Cyber insurance** | Coalition, Resilience, At-Bay | Become a discount factor on agentic AI risk underwriting. |

**Priority order for the first 3 partnerships:**
1. Microsoft Sentinel (alert source — required to operate)
2. CrowdStrike + SGNL (incident response + access orchestration — credibility + distribution)
3. Mandiant retainer integration (DFIR muscle + Fortune 500 access)

---

# Internal scorecard — where we stand today

| Dimension | Score (1–5) | Comment |
|---|---|---|
| **Product depth on M365** | 4 | Strong technical foundation, multi-tenant, identity-aware. Need cross-domain demo. |
| **Differentiation clarity** | 3 | Just sharpened. Page rewrite locks it in. |
| **Brand recognition** | 1 | Pre-launch. Zero CISO awareness. |
| **Channel / partnership** | 1 | None shipped yet. |
| **Customer proof** | 0 | No design partner yet. **This is the #1 gap.** |
| **Analyst awareness** | 1 | No briefings done yet. |
| **Capital / runway** | ? | TBD — but $3.6B in competitor funding means we need real capital |

The two highest-leverage actions in the next 60 days:

1. **One named design partner** (regulated F500 CISO, free 6 months, case study right)
2. **Gartner + Forrester briefing** to plant the "AIR" category name before someone else does

---

# Approval checklist

- [ ] Category name approved: *Agentic Incident Recovery (AIR)*
- [ ] Backup vendor positioning: complementary (not replacement) — approved
- [ ] Microsoft positioning: partner where possible — approved
- [ ] Pricing posture: IR budget line, not backup budget — approved
- [ ] Top 3 partnerships to pursue: Sentinel, CrowdStrike, Mandiant — approved
- [ ] First-60-day priorities: design partner + analyst briefing — approved

---

## How to use this doc

- **Sales:** Pin the battle card table on the wall. Memorize the five win themes.
- **Founder briefings (analyst / investor):** Use the strategic narrative section verbatim.
- **Product roadmap:** The "defensive moves" section is your prioritization backlog.
- **Landing page:** The win themes go on the page. The battle cards inform the FAQ.
- **Partnerships:** The partnership map drives BD priority.

This doc is updated every 90 days. Anything that changes in the competitive landscape — a new vendor, a Microsoft product launch, a Rubrik acquisition — gets edited in immediately.
