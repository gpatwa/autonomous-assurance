# KavachIQ Demo Cheat Sheet

*Internal use. Print or keep open during calls.*

---

## 0. Pre-demo checklist

Run this every time. The whole point is to make the live-demo failure modes (stale build, broken interaction, leaked tab, surprise notification) impossible.

**T-30 min — technical readiness**

- [ ] `SITE_URL=https://agents.kavachiq.com npm run verify:seo` → expect `✅ PASS (16/16)`. Anything less = production drift; pause the demo until reconciled (see `AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` § Drift detection).
- [ ] Hard-refresh `https://agents.kavachiq.com` (Cmd-Shift-R) and `https://agents.kavachiq.com/demo` to confirm the *current* deployed build serves cleanly — first-load CDN warming counts.
- [ ] Click through `/demo` end-to-end: Overview → Blast Radius (drill into Finance-Confidential) → Recovery Plan (expand step 1) → Resolution. The verify script can't catch interactive regressions; only your eyes can.

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

"We help enterprises recover from high-impact agent-driven changes in Microsoft Entra and Microsoft 365. When an agent changes an identity and that change cascades into permissions, data, and downstream systems, KavachIQ maps the blast radius and guides recovery in the right order."

## 2. One-line problem

AI agents are making changes to enterprise identity and data that existing tools cannot fully recover from.

## 3. One-line product

KavachIQ maps blast radius across Entra and Microsoft 365 and guides identity-first recovery back to a trusted operational state.

---

## 4. Demo order

1. **Homepage hero** — frame the problem (90 seconds max)
2. **Comparison section** — backup/observability/governance stop short
3. **Scenario section** — concrete Entra group change example
4. **Open /demo** — switch to operator console
5. **Overview tab** — incident context, 12 users, 5 systems
6. **Blast Radius tab** — click into Conditional Access or SharePoint detail
7. **Recovery Plan tab** — expand step 1 to show dependency chain
8. **Resolution tab** — trusted state restored, audit trail preserved
9. **Back to site CTA** — offer tailored walkthrough

---

## 5. What to emphasize

- Identity is the control plane. One Entra change cascades everywhere.
- Backup restores objects. It does not map blast radius or sequence recovery.
- Observability shows events. It cannot restore business state.
- Governance sets rules. It cannot unwind change once it lands.
- KavachIQ sequences rollback, restoration, and compensating actions.
- Recovery order matters. Identity first, then data, then downstream.
- The end goal is a trusted operational state, not just restored objects.

---

## 6. Strongest product moments

**Blast Radius tab** — click Finance-Confidential or Finance-MFA-Bypass. Shows before/after state, affected identities, and dependency note. This is where buyers see KavachIQ is real software, not slides.

**Recovery Plan tab** — expand step 1 (Entra group rollback). Shows dependency chain, linked objects, approval requirement, and expected result. This is where identity-first sequencing becomes obvious.

**Resolution tab** — 7 verified checks, trusted state confirmed, audit trail preserved. This is the confidence close.

---

## 7. Top objections

**"How is this different from backup?"**
Backup restores objects. KavachIQ maps blast radius across identity and data and sequences recovery. Different problem.

**"Does this replace our SIEM or governance?"**
No. SIEM detects. Governance sets rules. KavachIQ recovers business state after high-impact changes land. They are complementary.

**"Do you cover Teams?"**
Team membership, channels, and permissions. Not individual chat messages.

**"What do you cover in Entra?"**
Users, groups, app registrations, service principals, Conditional Access policies, and role assignments.

**"Is this just a Microsoft tool?"**
Entra and Microsoft 365 are the initial wedge. The same recovery model extends to connected enterprise systems over time.

**"Are you detecting incidents or recovering from them?"**
Recovery. We capture what happened, map what was affected, and guide how to get back to a trusted state.

---

## 8. What not to say

- Do not claim Teams chat message recovery
- Do not say "generic backup" or "better backup"
- Do not use anti-Microsoft framing
- Do not say "AI governance platform"
- Do not say "Deploy AI agents with confidence"
- Do not say "harmful" — use "high-impact"
- Do not say "context engine"
- Do not make unsupported product claims

---

## 9. Best closing

"We would like to show your team a recovery scenario tailored to your Entra and Microsoft 365 environment. We will walk through a real agent-driven change, the blast radius, and how identity-first recovery gets you back to a trusted state."

---

## 10. Live demo reminders

- Keep homepage framing under 90 seconds
- Move quickly through Overview tab
- Spend most time on **Blast Radius** (drill into one object) and **Recovery Plan** (expand step 1)
- Show **Resolution** as the confidence close — do not rush past it
- Always end with a specific next-step ask
- If short on time, skip directly from homepage comparison to /demo Blast Radius
