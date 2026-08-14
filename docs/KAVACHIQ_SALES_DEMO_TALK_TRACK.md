# KavachIQ Sales Demo Talk Track

**Audience:** Sales team, founder-led demos, and sales engineering
**Use with:** `KavachIQ_Prospect_Safe_Demo_Deck.pptx` for live presentation, `KavachIQ_Prospect_Safe_Demo_Deck_Buyer_Sendable.pptx` as the leave-behind
**Goal:** Keep every prospect conversation on the Agentic Incident Recovery wedge.

---

## The One Sentence

KavachIQ is the undo button for AI-agent incidents in Microsoft 365: detection alerts, backup restores yesterday, governance sets rules, and KavachIQ reverses the agent's specific actions after operator approval.

## The Call Flow

Use the deck for 5-7 minutes, then move to the live demo.

1. Frame the category gap.
2. Show the controlled Microsoft 365 incident.
3. Explain the recovery workflow.
4. Show blast radius, recovery plan, and evidence.
5. Move into the live product demo.
6. Close with a tailored recovery walkthrough.

Do not let the deck replace the product demo. The deck earns permission to show the product.

---

## Slide-By-Slide Talk Track

### Slide 1 — The Undo Button

**Purpose:** Establish the wedge immediately.

**Say:**
> KavachIQ is Agentic Incident Recovery for Microsoft 365. When an AI agent makes harmful changes across identity, sharing, permissions, Conditional Access, DLP, or data state, security teams need a safe way to undo what the agent did without rolling back legitimate work.

**Transition:**
> The reason this matters is that agents are not just generating text anymore. They are changing enterprise state.

### Slide 2 — AI Agents Change Enterprise State

**Purpose:** Make the problem concrete.

**Say:**
> The operational risk is not abstract AI risk. It is a service principal modifying a privileged group, an agent changing sharing links, a Copilot Studio workflow touching mailbox or Teams permissions, or an automation changing Conditional Access scope. Once that lands, multiple teams have to reconstruct what happened and what to reverse.

**Transition:**
> Existing tools help, but they each stop before recovery.

### Slide 3 — Current Stack Gap

**Purpose:** Separate KavachIQ from backup, SIEM, and governance.

**Say:**
> Detection tells you something happened. Backup restores data to a point in time. Governance sets rules before the fact. None of those gives the DFIR team an approval-gated, dependency-ordered reversal of the specific actions the agent took.

**Use the line:**
> Rubrik is backup. Sentinel alerts. KavachIQ is undo.

**Transition:**
> Let me show you the scenario we use to make this tangible.

### Slide 4 — Controlled Microsoft 365 Incident

**Purpose:** Ground the demo in one realistic recovery case.

**Say:**
> In this controlled Microsoft 365 demo tenant, a known service-principal agent adds 12 users to a high-sensitivity finance group. That single identity change creates downstream access through SharePoint, Exchange, Teams, applications, and Conditional Access.

**Clarify:**
> This is representative demo data, not customer content.

**Transition:**
> KavachIQ turns that change burst into an operator workflow.

### Slide 5 — Product Workflow

**Purpose:** Make the product motion memorable.

**Say:**
> The product loop is simple: alert, blast radius, plan, approval, validation. KavachIQ ingests an incident signal from the customer's detection layer, maps the Microsoft 365 blast radius, proposes a dependency-ordered recovery plan, waits for operator approval, executes the approved steps, and validates the state.

**Use the line:**
> Observability explains the failure. KavachIQ reverses the damage.

**Transition:**
> The first product moment is blast radius.

### Slide 6 — Blast Radius

**Purpose:** Show that KavachIQ understands dependencies, not just raw logs.

**Say:**
> This is where a buyer sees KavachIQ is not just another alert. The platform groups impacted identities and downstream Microsoft 365 surfaces into a recovery map. The operator can see why the identity change matters before anyone touches the tenant.

**Point to:**
> identities, SharePoint, Exchange, Teams, applications, Conditional Access.

**Transition:**
> Once the impact is clear, the platform proposes the reversal sequence.

### Slide 7 — Recovery Plan

**Purpose:** Emphasize approval-gated reversal and identity-first sequencing.

**Say:**
> Recovery order matters. Identity comes first because access inherited through groups can reappear if you fix downstream systems before the root identity state. KavachIQ proposes the plan, but the operator remains in control. No silent rollback.

**Use the line:**
> The platform proposes. The operator approves. KavachIQ executes and validates.

**Transition:**
> The close is not a green check. The close is evidence.

### Slide 8 — Evidence

**Purpose:** Connect the product to CISO, DFIR, audit, and board needs.

**Say:**
> The evidence pack records the recovery case: what changed, what was approved, what executed, what validated, and what content boundaries were preserved. This is the artifact the team can take to audit, the board, and the post-mortem.

**Do not say:**
> Detailed implementation specifics live under NDA. Keep this slide outcome-led unless procurement asks.

**Transition:**
> The next step is not a generic demo. It is a recovery walkthrough around their scenario.

### Slide 9 — Next Step

**Purpose:** Close with a specific buyer action.

**Say:**
> Bring us your worst-case Microsoft 365 agent scenario. We will walk the recovery: incident signal, blast radius, recovery sequence, approval, validation, and evidence.

**Close:**
> If this is relevant, the right next step is a tailored recovery scenario walkthrough with your security, identity, and Microsoft 365 teams.

---

## Discovery Questions

Use these before or during the demo to tailor the conversation.

1. Where are AI agents or Copilot-style automations already active in your Microsoft 365 environment?
2. Which team owns recovery if an agent changes identity, sharing, or Conditional Access state?
3. What would be the hardest Microsoft 365 change to manually unwind today?
4. Do you already ingest Purview, Defender, Sentinel, or SIEM alerts for agent or automation activity?
5. Who has to approve a reversal in your tenant: DFIR, identity, M365 admin, or CISO?
6. What evidence would your team need after a recovery: audit, board reporting, cyber insurance, or post-mortem?

---

## Fast Objection Pivots

**We already have backup.**
Backup restores data to a point in time. KavachIQ reverses the agent's specific actions and preserves legitimate work.

**We already have a SIEM.**
Good. KavachIQ runs downstream of SIEM, Sentinel, Defender, or Purview. Detection is the signal; recovery is the missing action.

**We have governance.**
Governance sets rules before the fact. KavachIQ recovers after a high-impact change lands.

**Is this a Microsoft replacement?**
No. KavachIQ uses the Microsoft ecosystem and runs alongside Purview, Defender, Sentinel, Entra, and Microsoft Graph.

**Is this real product or a concept?**
The demo uses a representative Microsoft 365 recovery scenario with alert ingestion, blast radius, recovery plan, operator approval, validation, and evidence.

**What do you access?**
Keep the public answer outcome-led: KavachIQ captures change metadata and does not store business document content. Detailed scope inventory is available under NDA.

---

## What Not To Say

- Do not say KavachIQ is backup.
- Do not say KavachIQ replaces SIEM, SOAR, Purview, Defender, Sentinel, or governance tools.
- Do not say generic AI governance platform.
- Do not promise one-click rollback, zero downtime, or exact MTTR numbers.
- Do not claim Teams chat message recovery.
- Do not discuss procurement-only implementation details unless the call is under NDA.
- Do not use old wedge language such as Autonomous Assurance, Identity Assurance, or Data Assurance.

---

## Best Live Demo Sequence

1. Open the deck and present slides 1-5.
2. Move quickly through slides 6-8 using the screenshots.
3. Open `https://agents.kavachiq.com/demo`.
4. Show Overview, then spend time on Blast Radius and Recovery Plan.
5. Show Resolution as the confidence close.
6. If signed in and appropriate, open `/console/incidents` and show the latest controlled incident evidence.
7. Return to slide 9 or the site CTA and ask for a tailored recovery walkthrough.

---

## Leave-Behind Guidance

Send `KavachIQ_Prospect_Safe_Demo_Deck_Buyer_Sendable.pptx` after the call.

Do not send the presenter deck with notes. Use the buyer-sendable deck plus `BUYER_EXEC_ONE_PAGER.md` content when a shorter written follow-up is needed.
