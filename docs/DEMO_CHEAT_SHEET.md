# KavachIQ Demo Cheat Sheet

*Internal use. Print or keep open during calls.*

> **One-page version:** [`DEMO_PRESENTER_CARD.md`](DEMO_PRESENTER_CARD.md) — compressed for mid-call reference. This file is the source of truth; the card is a derived view.

---

## 0. Pre-demo checklist

Run this every time. The whole point is to make the live-demo failure modes (stale build, broken interaction, leaked tab, surprise notification) impossible.

**T-30 min — technical readiness**

- [ ] `SITE_URL=https://agents.kavachiq.com npm run verify:seo` → expect `✅ PASS (16/16)`. Anything less = production drift; pause the demo until reconciled (see `AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` § Drift detection).
- [ ] From `platform/`, run `npm run live-demo-readiness -- --apply --runs 1 --api-url https://ca-api-dev.nicesand-85e14f44.centralus.azurecontainerapps.io --output ../artifacts/live-mvp/readiness-summary.json`. Expect validation `match`, post-recovery group member count `4`, and an evidence pack artifact.
- [ ] Hard-refresh `https://agents.kavachiq.com` (Cmd-Shift-R) and `https://agents.kavachiq.com/demo` to confirm the *current* deployed build serves cleanly — first-load CDN warming counts.
- [ ] Click through `/demo` end-to-end: Overview → Blast Radius (drill into Finance-Confidential) → Recovery Plan (expand step 1) → Resolution. The verify script can't catch interactive regressions; only your eyes can.
- [ ] Open `/console/incidents`, select the latest CANONICAL-001 incident, and confirm Recovery execution shows approval, completed execution, validation `match`, and evidence boundaries.
- [ ] On the homepage, scroll through every section so the IntersectionObservers fire before sharing the screen. Some animations don't show on first load if you jump straight to a section.

**T-5 min — presenter setup**

- [ ] Use a **fresh browser profile or incognito window** for the demo tab. No autocomplete history, no logged-in side accounts, no extension chrome.
- [ ] **Close every other browser tab and window** in the profile you're sharing. URL-bar autocomplete is the most common leak.
- [ ] Slack / Teams / Outlook / Calendar → **Do Not Disturb** (or quit). Notifications during a demo are unprofessional and sometimes confidential.
- [ ] Test screen share inside the actual conferencing tool *before* the customer joins. Confirm only the demo window is visible, not your full desktop.

**T-0 — just before joining**

- [ ] This cheat sheet and `DEMO_SCRIPT.md` open on a **second screen or in a window you are NOT sharing**. Never on the demo tab.
- [ ] Audio / mic check inside the conferencing tool.

**If something fails live**

- [ ] If the live site times out or 5xxs: switch to the recorded `/demo` walkthrough screen-capture (keep one in `~/demos/`).
- [ ] If `/demo` interaction breaks mid-call: continue verbally with the talking points (§5 below), promise a tailored walkthrough, close the call early — don't fight a broken UI on stage.
- [ ] After the call: file the failure against the repo with the timestamp + failing tab; investigate before the next demo.

---

## 1. 30-second opener

"KavachIQ is the undo button for AI-agent incidents in Microsoft 365. When an AI agent makes harmful changes — group memberships, sharing links, permission grants, Conditional Access exemptions — your team has minutes before the blast radius cascades. Detection tools alert you. Backup restores yesterday. We reverse only the specific changes the agent made, after operator approval, with full audit."

## 2. One-line problem

AI agents are taking real actions in Microsoft 365 — and 80% of the Fortune 500 are running them with no governance program in place. Detection and backup don't reverse what the agent just did.

## 3. One-line product

KavachIQ is **Agentic Incident Recovery** — operator-approved, dependency-ordered reversal of AI-agent-driven changes across Microsoft Entra and Microsoft 365.

---

## 4. Demo order (new homepage)

1. **Hero** — "The undo button for AI-agent incidents" (≤30s)
2. **Proof bar** — 80/10 adoption-governance gap · $3.6B funded · Forrester quote (20s)
3. **Vendor consensus wall** — Microsoft, Salesforce, ServiceNow, Anthropic all say this layer is needed (20s)
4. **Recovery gap** — "Everyone detects. No one undoes." (30s)
5. **Live walkthrough** — 4-stage animation cycles: alert → map → propose → approve & validate (30s)
6. **Incident cards** — EchoLeak, Copilot Studio AIjacking, Entra Agent ID overreach, Replit (30s)
7. **Open `/demo`** — switch to the safe interactive walkthrough
8. **Overview tab** — incident context, 12 users, 5 systems
9. **Blast Radius tab** — click into Conditional Access or SharePoint detail
10. **Recovery Plan tab** — expand step 1 to show dependency chain
11. **Resolution tab** — trusted state restored, evidence pack preserved
12. **Open `/console/incidents`** — show the latest live incident's recovery execution evidence
13. **Back to site CTA** — offer tailored walkthrough

---

## 5. What to emphasize

- **The wedge in one sentence:** "Backup restores yesterday. KavachIQ reverses six hours of agent actions — and keeps everything else."
- **Five recovery surfaces:** Identity (Entra) · Conditional Access · Permissions (Graph + M365) · Sharing (SharePoint, OneDrive, Teams) · Data (DLP, sensitivity labels).
- **Identity-first dependency ordering:** Identity first, then permissions, then sharing and Conditional Access, then data. The graph respects what depends on what — revoking access doesn't lock out a Global Admin.
- **Operator-approved every time:** No automated rollback. The platform proposes; the operator approves; KavachIQ executes and validates.
- **Detection vendors are partners, not competitors:** Sentinel / Defender / Purview / Zenity / WitnessAI are the alert source. We run downstream.
- **The trust posture (four pillars):** approval-gated reversal · least-privilege Microsoft access · tenant-scoped isolation · audit trail + exportable evidence pack.

---

## 6. Strongest product moments

**Live walkthrough animation (homepage)** — let it cycle once silently while the buyer reads the captions. The 4-stage progression makes the operational flow obvious without you having to explain it.

**Blast Radius tab (`/demo`)** — click Finance-Confidential or Finance-MFA-Bypass. Shows before/after state, affected identities, dependency note. This is where buyers see KavachIQ is real software, not slides.

**Recovery Plan tab (`/demo`)** — expand step 1 (Entra group rollback). Shows dependency chain, linked objects, approval requirement, expected result. This is where identity-first sequencing becomes obvious.

**Resolution tab (`/demo`)** — trusted state confirmed, evidence pack preserved. This is the confidence close.

**Live console incident (`/console/incidents/:id`)** — show the generated plan, operator approval, 12 removed users, validation `match`, post-recovery member count `4`, and evidence boundaries from the actual Azure-backed run.

---

## 7. Top objections

**"How is this different from backup?"**
**Rubrik is backup. KavachIQ is undo.** Backup restores yesterday and loses every legitimate change since. We reverse only the agent's actions; everything else stays. Different problem, different remediation, complementary purchase.

**"Does this replace our SIEM or governance?"**
No. SIEM detects, governance sets rules before the fact, we recover after a change lands. We ingest from Sentinel, Defender, Purview as the alert source. Complementary.

**"Do you cover Teams?"**
Team membership, channel structure, channel permissions, and guest access. Not individual chat messages.

**"What do you cover in Entra?"**
Users, groups, app registrations, service principals, Conditional Access policies, and role assignments. The five recovery surfaces on the platform page.

**"Is this just a Microsoft tool?"**
Microsoft 365 is the wedge — 80% of agentic risk lives there. Q3 2026 adds Copilot Studio + Entra Agent ID. Late 2026 adds Salesforce Agentforce and ServiceNow Now Assist.

**"Are you detecting incidents or recovering from them?"**
Recovery. Detection is mature; operational recovery is the missing layer.

**"What's the operator approval model?"**
Every recovery is proposed for human review. No automated rollback. The platform does not act on its own. Operators see the full plan before approving.

**"What scopes do you need in our tenant?"**
Today, read-only: `AuditLog.Read.All` and `Directory.Read.All` via Microsoft Graph, admin-consented per tenant. Write scopes are provisioned only when a customer enables platform-driven reversal. Detailed scope inventory is in the procurement-detail doc, NDA-gated.

---

## 8. What not to say

- Do not claim Teams chat message recovery
- Do not say "generic backup" or "better backup" — say "Rubrik is backup, KavachIQ is undo"
- Do not use anti-vendor framing — detection vendors and backup vendors are partners
- Do not say "AI governance platform"
- Do not say "Deploy AI agents with confidence"
- Do not say "context engine"
- Do not commit to MTTR numbers — say "minutes, not hours"
- Do not say "zero downtime" or "one click"
- Do not name implementation specifics on a buyer call (Postgres RLS, signed JSON, Entra External ID, etc.) — those live in the procurement-detail doc, NDA-gated
- Do not say "Autonomous Assurance" or "Identity Assurance" / "Data Assurance" as section names — those are the old wedge; the new section names are "Agentic Identity Recovery" / "Agentic Data Recovery"

---

## 9. Best closing

"Adoption is moving faster than governance. The organizations that scale AI agents safely are the ones with a recovery posture in place *before* their first agentic incident. We'd like to walk through a scenario tailored to your Microsoft 365 environment — alert ingestion, blast radius mapping, identity-first reversal proposal, operator approval, validation, and the evidence pack. Bring a scenario; we'll walk it."

---

## 10. Live demo reminders

- Keep homepage walkthrough under 3 minutes (hero through incident cards)
- Move quickly through `/demo` Overview tab
- Spend most time on **Blast Radius** (drill into one object) and **Recovery Plan** (expand step 1)
- Show **Resolution** as the confidence close — do not rush past it
- Always end with a specific next-step ask
- If short on time, skip from Recovery Gap straight to `/demo` Blast Radius
