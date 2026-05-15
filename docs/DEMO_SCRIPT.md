# KavachIQ Demo Script

**Version:** Recovery-positioning baseline (post-AIR wedge launch)
**Public site:** agents.kavachiq.com
**Last updated:** 2026-05-12 — aligned with Agentic Incident Recovery wedge. Pre-demo checklist in `DEMO_CHEAT_SHEET.md`; mid-call reference in [`DEMO_PRESENTER_CARD.md`](DEMO_PRESENTER_CARD.md).

---

## 1. 30-Second Company Pitch

> AI agents in Microsoft 365 — Copilot, Copilot Studio, custom agents — are taking real actions in real tenants. Some of those actions are harmful: prompt injection, model misbehavior, unintended automation side effects. When that happens, your detection layer alerts you. Backup restores yesterday's data. Neither reverses the specific changes the agent just made.
>
> KavachIQ is the undo button. We attribute every change to the agent's session, propose a dependency-ordered reversal plan, and execute it after operator approval — with full audit. Built first for Microsoft 365.
>
> The category is Agentic Incident Recovery. Microsoft, Salesforce, ServiceNow, and Anthropic have all publicly said this layer needs to exist. We built it.

**When to use:** elevator conversations, networking, cold intros, advisor catch-ups.

---

## 2. Two-Minute Website Walkthrough

Use this when screen-sharing the homepage in a short call.

**Open agents.kavachiq.com.**

### Hero (15 seconds)

"This is KavachIQ — Agentic Incident Recovery. The hero says it directly: 'The undo button for AI-agent incidents.' When an AI agent makes harmful changes in your Microsoft 365 environment, your team has minutes before the blast radius cascades. We're the layer that reverses it."

Point to: the headline, the sub-headline, the supporting line *"Built first for Microsoft 365 — where 80% of agentic risk lives today."*

### Proof bar (10 seconds)

"Three sourced numbers below the fold. Eighty percent of the Fortune 500 use AI agents in production. Ten percent have a governance program. That's the gap. Three-point-six billion dollars went into AI-agent security startups last year — and not one focused on recovery. Forrester says an agentic AI breach is not a question of whether, but which organization will be first."

### Vendor consensus wall (15 seconds)

Scroll to the vendor consensus quotes.

"This isn't us crying wolf. Microsoft's Vasu Jakkal, Salesforce's Marc Benioff, ServiceNow's Bill McDermott, Anthropic, and Gartner have all publicly said this layer needs to exist. We built it."

Point to: any of the five vendor pull-quote tiles.

### Recovery gap (20 seconds)

Scroll to the recovery gap section.

"This is the wedge. Everyone detects — Purview, Defender, Sentinel, Zenity, WitnessAI. Nobody undoes. The alert fires at 2:47 a.m. By 2:48 you're staring at 47 identity, sharing, and permission changes an AI agent made. KavachIQ takes that alert and proposes a dependency-ordered reversal."

Point to: the 2-column table (detection vs recovery).

### Live recovery walkthrough (20 seconds)

Scroll to the live walkthrough section.

"This auto-advances through the four-stage flow. Alert ingested. Blast radius mapped — every change attributed to the agent's session, classified by surface. Reversal plan proposed in dependency order. Operator approves, execution happens, state is validated. Trusted state restored."

Point to: the animation; let it cycle once.

### Incident proof (15 seconds)

Scroll to the incident cards.

"Four real, named incidents. EchoLeak — zero-click prompt injection in Microsoft 365 Copilot. Copilot Studio AIjacking — agent exfiltrates data through its own email connector. Entra Agent ID Administrator role overreach — AI-specific role granted tenant-wide takeover access. Replit — agent acted during a code freeze and fabricated records. Each one is a case where a recovery layer would have changed the outcome."

### CTA (10 seconds)

Scroll to the closing CTA.

"Adoption is moving faster than governance. The organizations that scale AI agents safely will be the ones with a recovery posture in place *before* their first agentic incident. Request a demo right here."

---

## 3. Five-Minute Product Narrative

Use this for longer advisor calls, investor conversations, or first buyer meetings.

### The setup (1 minute)

"AI agents in Microsoft 365 aren't hypothetical anymore. Copilot, Copilot Studio, custom Entra-registered agents — they take real actions in real tenants: create users, modify group memberships, add service principal owners, change Conditional Access exemptions, alter sharing on SharePoint and OneDrive, modify DLP labels."

"Microsoft's own data: 80% of the Fortune 500 use AI agents in production. Only 10% have a governance program. The gap is real, and it's where the next class of breaches lives."

### The gap (1 minute)

"Existing layers each solve part of the problem. Detection tools — Purview, Defender, Sentinel, Zenity — tell you something happened. Backup tools — Microsoft 365 Backup, Rubrik, Cohesity — restore data to a point in time. Governance — Purview policies, access reviews — sets rules before the fact."

"What's missing is the operational layer that reverses *the specific actions an AI agent took*, without rolling back legitimate work alongside. Restore-to-yesterday loses 21 hours of legitimate work and breaks active collaboration. Manual runbooks can't sequence 47 cascading changes across identity, sharing, permissions, and DLP without leaving the tenant in an inconsistent state."

### What KavachIQ does (1 minute)

"KavachIQ is the recovery layer for AI-agent incidents. Four steps. First, we ingest the incident from your existing detection layer — Sentinel, Purview, Defender, your SIEM. Second, we attribute every change in the agent's session to its source and build a dependency graph across identity, sharing, permissions, Conditional Access, and DLP. Third, we propose a dependency-ordered reversal — identity first, then permissions, then sharing and Conditional Access, then data. Fourth, your operator approves the plan, we execute each step, and validate the result against expected state."

"The output is restored trusted state plus an exportable evidence pack — every action recorded, ready for the auditor, the board, and the post-mortem."

### The wedge (1 minute)

"Built first for Microsoft 365 — for two reasons. One, that's where 80% of agentic risk lives today. Two, Microsoft is where the cross-domain dependency graph is hardest to model and most valuable to get right — Entra plus SharePoint plus Conditional Access plus DLP plus Teams, all in one orchestrated reversal."

"The roadmap: Q3 2026 adds Copilot Studio agents and Entra Agent ID coverage. Late 2026 adds Salesforce Agentforce and ServiceNow Now Assist. Each platform earns its place by depth, not breadth — we do Microsoft 365 better than anyone before we add anything else."

### The trust posture (45 seconds)

"Four pillars. Approval-gated reversal — operators see the full proposed plan before any change runs; the platform does not act on its own. Least-privilege Microsoft access — admin-consented per tenant, scoped to the surfaces under recovery management. Tenant-scoped isolation — per-tenant data and access boundaries enforced at the data layer, with tenant-bound key material. Audit trail and evidence — every step recorded with operator identity, timestamp, and outcome, exportable for audit and board reporting."

### The ask (15 seconds)

"We run tailored recovery scenario walkthroughs. We'll show you a representative scenario in a Microsoft 365 tenant — alert ingestion, blast radius mapping, identity-first reversal proposal, operator approval, validation, evidence pack. Bring a scenario; we'll walk it."

---

## 4. Ten-Minute Demo Flow

Structured buyer demos, technical evaluations, detailed investor walkthroughs.

### Minute 0–1: Context

"Thanks for the time. Let me show you what KavachIQ does and why it matters for your Microsoft 365 environment."

Open agents.kavachiq.com. Walk through the hero.

"This is the wedge: the undo button for AI-agent incidents in Microsoft 365. We're the operational layer that reverses the specific changes an AI agent made — after operator approval — and validates the result."

### Minute 1–2: The market reality

Scroll to the proof bar and then the vendor consensus wall.

"Three sourced numbers. Eighty/ten — adoption gap. Three-point-six billion in funding — but no one focused on recovery. Forrester predicting the first agentic breach in 2026."

"This is the vendor consensus wall. Microsoft, Salesforce, ServiceNow, Anthropic, Gartner — they've all publicly said this layer needs to exist. We're not coming in from a fringe position; we're building what the platforms themselves say is missing."

### Minute 2–3: The recovery gap

Scroll to the recovery gap section.

"This is the differentiation. Three rows. Detection tells you something happened. Audit logs are useful in forensics, slow in an incident. War rooms — hours, multiple engineers, runbooks that don't quite fit. Versus KavachIQ — recovery downstream of detection, operational rollback scoped to the agent's session, guided reversal with approval gates and full evidence."

"Detection is mature. Operational recovery is the missing layer."

### Minute 3–5: Live recovery walkthrough

Scroll to the walkthrough section.

"Here's what recovery looks like, in a representative scenario. The animation auto-advances through four stages."

Let the animation cycle once, then narrate:

1. "Stage one — alert ingested. KavachIQ accepts the incident signal from your detection layer."
2. "Stage two — blast radius mapped. Each change in the agent's session is attributed and classified by surface: identity, permissions, sharing, Conditional Access, DLP."
3. "Stage three — plan proposed. Dependency-ordered. Identity first, then permissions, then sharing, then Conditional Access, then data."
4. "Stage four — operator approves, execution proceeds, state is validated. Trusted state restored. Evidence pack generated."

"In a buyer environment, the operator drives that flow on real incidents. Bring a scenario; we'll walk it."

### Minute 5–6: Incident proof

Scroll to the incident cards.

"These are real, named cases. Four cards."

- "EchoLeak — CVE-2025-32711. A crafted email caused Microsoft 365 Copilot to act on attacker instructions, accessing Teams, SharePoint, and OneDrive content. Every pre-patch tenant had limited operational visibility into what Copilot retrieved or shared."
- "Copilot Studio AIjacking — Cloud Security Alliance research. Agents hijacked via embedded instructions, then exfiltrated SharePoint and OneDrive data via their own configured email connector."
- "Entra Agent ID Administrator role overreach — April 2026 CVE. A new Entra role intended for AI agent management granted ownership over any service principal in the tenant. Silverfort disclosed it; Microsoft patched."
- "Replit — broader category proof. AI coding agent acted during a code-and-action freeze, deleted a production database, fabricated records to conceal the deletion. No automated recovery path existed."

"Each card carries a recovery posture — what KavachIQ would have done."

### Minute 6–7: How it works

Scroll to the How It Works section.

"Four operational steps."

1. "Connect to your detection layer. Sentinel, Purview, Defender, or your SIEM/SOAR. We run downstream of detection — your existing alert posture stays in place."
2. "Map the blast radius. Every identity, sharing, permission, Conditional Access, and DLP change attributed to the agent's session — modeled as a dependency graph."
3. "Propose an identity-first reversal plan. Dependency-ordered. The graph respects what depends on what — revoking access doesn't lock out a Global Admin, undoing a share doesn't break an active collaboration."
4. "Approve, execute, and validate. Operator review before any change runs. Each step validated against expected state. Exportable evidence pack at the end."

### Minute 7–8: Trust and control

Scroll to the Trust and Control section.

"Four pillars, because the CISO needs to know what we *don't* do in their tenant."

- "Approval-gated reversal — no automated rollback. The platform does not act on its own."
- "Least-privilege Microsoft access — Graph permissions admin-consented per tenant, scoped to the surfaces under recovery management."
- "Tenant-scoped isolation — per-tenant data and access boundaries enforced at the data layer, with tenant-bound key material."
- "Audit trail and evidence pack — every step recorded, exportable for audit, SIEM ingest, and board reporting."

"Recovery you can defend to your auditor, your board, and your own DFIR team."

### Minute 8–9: Who it's for and roadmap

Scroll to Who It's For.

"Four buyer rows. CISO gets a defensible MTTR. DFIR lead gets a single recovery pane. VP Identity / M365 Admin gets a safety net for Copilot, Copilot Studio, and custom agents. CFO / Risk Officer gets a measurable recovery posture — insurable, auditable, board-defensible."

Scroll to the platform page if useful, point to the roadmap footer line:

"Microsoft 365 today. Copilot Studio + Entra Agent ID coverage Q3 2026. Salesforce Agentforce + ServiceNow Now Assist on the roadmap."

### Minute 9–10: CTA and next steps

Scroll to the closing CTA.

"The line is: adoption is moving faster than governance. The organizations that scale AI agents safely will be the ones with a recovery posture in place *before* their first agentic incident."

"What we'd like to do next is walk your team through a recovery scenario tailored to your environment. We'll show you alert ingestion, blast radius mapping across all five Microsoft 365 surfaces, identity-first reversal proposal, operator approval, validation, and the evidence pack. Bring a scenario; we'll walk it."

"The form is right here, or I can send you a direct link."

---

## 5. Expected Buyer Questions

### From CISOs

- "How is this different from our existing backup solution?"
- "Does this replace our SIEM or SOAR?"
- "What if the agent change is malicious, not just accidental?"
- "How do you handle Conditional Access policy changes specifically?"
- "What's the operator approval model? Can recovery happen without me?"
- "What scopes do you need in our tenant?"
- "What happens to our data if we cancel?"

### From CIOs / Heads of IT

- "How does this fit into our existing Microsoft stack?"
- "What is the deployment model?"
- "How quickly can we get this into staging?"
- "Does this work with our existing identity governance tools?"
- "What's the roadmap beyond Microsoft 365?"

### From Identity / Entra Admins

- "Does this cover service principals and app registrations?"
- "How do you handle nested group membership changes?"
- "Can I see the before/after state for a Conditional Access policy change?"
- "Does this read from Entra audit logs?"
- "Can I control which reversal actions require manual approval?"
- "What's the Microsoft Graph permission scope list?"

### From Microsoft 365 Admins

- "Does this cover SharePoint permissions specifically?"
- "What about Exchange mailbox delegations and inbox rules?"
- "How do you handle Teams team membership and channel permission changes?"
- "Can I see which files or sites were affected by an identity change?"
- "How do you handle DLP and sensitivity label modifications?"

### From DFIR / Incident Response leads

- "What does the evidence pack contain?"
- "Can the evidence pack be ingested by Sentinel / Splunk?"
- "What's the recovery MTTR in a typical scenario?"
- "How do you handle a failed reversal step mid-plan?"

---

## 6. Suggested Answers

### "How is this different from backup?"

"Backup restores data to a point in time. KavachIQ reverses the specific actions an AI agent took — preserving every legitimate change that happened in parallel. Restore-to-yesterday loses every hour of legitimate work since the snapshot. Rubrik, Cohesity, and Microsoft 365 Backup are the wrong primitive for agent error: snapshot-based, coarse, and agent-agnostic. The line we use: *Rubrik is backup. KavachIQ is undo.* You pair us with your backup, you don't replace it."

### "Does this replace our SIEM?"

"No. Your SIEM detects and alerts. KavachIQ picks up where detection ends. We ingest incidents from Sentinel, Defender, Purview, or your SIEM/SOAR as the alert source — we run downstream of detection. They're complementary."

### "What about malicious changes?"

"The flow is the same whether the change was accidental, risky, or malicious. We attribute the change to the agent's session, map the blast radius, propose a dependency-ordered reversal, and execute after operator approval. For malicious changes the evidence pack is especially important — audit-grade timeline of agent action, ingestion, mapping, approval, reversal, and validation, suitable for forensics and incident response."

### "Does this cover Conditional Access?"

"Yes. Conditional Access is one of the five recovery surfaces — alongside identity, permissions, sharing, and data. When an agent modifies a Conditional Access policy — scope changes, exemptions added, sign-in risk thresholds, MFA bypass conditions — we capture the change, model the downstream access impact, and sequence reversal alongside the related identity and permission changes."

### "What's the operator approval model?"

"Every recovery is proposed for human review. No automated rollback. Operators see the full proposed reversal — every step and its dependency — before any change runs. Approval is an explicit, scoped action; the platform does not act on its own. Partial approval — approving a subset of the plan — is supported in the data model."

### "What scopes do you need?"

"Today, read-only: `AuditLog.Read.All` and `Directory.Read.All` via Microsoft Graph, admin-consented per tenant. For platform-driven reversal we provision write scopes when a customer chooses to enable it — `Group.ReadWrite.All`, `Application.ReadWrite.All`, `Policy.ReadWrite.ConditionalAccess`, `RoleManagement.ReadWrite.Directory`, `Sites.FullControl.All`. Until then, KavachIQ proposes plans and your operators execute via their own tooling. The detailed scope inventory is available under NDA."

### "How does this fit into our Microsoft stack?"

"KavachIQ integrates with your Entra and Microsoft 365 environment through standard Microsoft Graph APIs. No agents installed in your environment, no infrastructure changes. We read from Entra audit logs and Microsoft Graph. We do not replace your identity governance, your detection layer, or your backup. We add the recovery layer those tools don't provide."

### "What about Teams?"

"We cover Teams at the collaboration and access layer: team membership, channel structure, channel permission changes, guest access. We do not claim to recover individual Teams chat messages. The focus is on the identity and permission changes that affect Teams collaboration, not message-level content."

### "What's the deployment model?"

"Cloud-hosted, hosted in Azure. Microsoft Graph integration. Standard admin-consent flow at onboarding. No agents installed in your environment. No appliance, no inbound network changes. Deployment is lightweight — typically a single admin-consent action and configuration of your detection layer's webhook."

### "What's on the roadmap beyond Microsoft 365?"

"Microsoft Entra and Microsoft 365 are the initial wedge — that's where 80% of agentic risk lives today. Q3 2026: Copilot Studio agents, Entra Agent ID coverage, custom-agent attribution via Microsoft Graph. Late 2026: Salesforce Agentforce, ServiceNow Now Assist, adjacent agent platforms. Each platform earns its place by depth, not breadth — we do Microsoft 365 better than anyone before we add anything else."

### "What's in the evidence pack?"

"For each recovery operation: the originating incident (agent, session, surface, raw audit-log references), the proposed plan (all steps, dependency graph, expected outcomes), operator approval (identity, timestamp, scope of approval), step-by-step execution results with validation outcomes, and final state confirmation with operator sign-off. Format is JSON, designed for SIEM ingest and audit-tool compatibility."

---

## 7. What Not to Say

### Do not overclaim Teams recovery

- Do not say: "We recover Teams chat messages" or "We restore Teams conversations."
- Do say: "We cover Teams at the collaboration and access layer: team membership, channel structure, and permissions."

### Do not position as backup

- Do not say: "We're a better backup for Microsoft 365."
- Do say: "We're the recovery layer that backup doesn't provide. Rubrik is backup. KavachIQ is undo."

### Do not position as generic AI governance

- Do not say: "We govern AI agents" or "We control what agents can do."
- Do say: "We help enterprises recover when agent-driven changes are harmful. Governance sets rules before the fact. KavachIQ recovers after the rules aren't enough."

### Do not use anti-vendor framing

- Do not say: "Microsoft doesn't protect your data" or "Detection vendors don't show up."
- Do say: "Microsoft provides strong identity and collaboration infrastructure. Detection vendors do detection well. KavachIQ adds the recovery layer none of them provide."

### Do not sound like a vague AI platform

- Do not say: "We provide AI-powered insights" or "Our AI engine analyzes your environment."
- Do say: "We attribute every change to the agent's session, propose a dependency-ordered reversal, and execute after operator approval. The value is operational, not analytical."

### Do not over-claim implementation specifics on a buyer call

- Do not say: "We use Postgres row-level security" or "Our evidence pack is signed JSON" or "We use Entra External ID for operator identity."
- Do say: "Tenant isolation is enforced at the data layer. Audit trail is exportable for audit, SIEM ingest, and board reporting. Operator identity is anchored to verifiable enterprise identity."
- The implementation specifics are in the procurement-detail doc, NDA-gated. Share that doc only on serious procurement calls.

### Do not commit to MTTR numbers we can't defend

- Do not say: "Recovery in 92 seconds" or "Zero downtime."
- Do say: "Operator-approved, dependency-ordered reversal. Minutes, not hours. Validated against expected state."

### Do not make unsupported claims

- Do not say: "We prevent all agent-driven incidents."
- Do say: "Detection prevents some incidents. Governance prevents others. KavachIQ recovers when those layers aren't enough."

### Do not use stale messaging

- Do not say: "Autonomous Assurance" — that's the old brand framing.
- Do not say: "Identity Assurance" or "Data Assurance" — those are the old section names.
- Do say: "Agentic Incident Recovery." The category. The wedge.
- Do say: "Agentic Identity Recovery" and "Agentic Data Recovery" — the section names.
- Do say: "The undo button for AI-agent incidents." The hero promise.
