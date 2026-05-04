# KavachIQ Demo Presenter Card

*One page. Print or pin to a second screen. Internal only.*

> Compressed view of `DEMO_CHEAT_SHEET.md` + `DEMO_SCRIPT.md`. If this card and the cheat sheet disagree, the **cheat sheet wins** — update both.

---

## Before (run every time)

1. `SITE_URL=https://agents.kavachiq.com npm run verify:seo` → **16/16**
2. Click `/demo` Overview → Blast Radius (drill) → Recovery Plan (expand) → Resolution
3. Fresh browser profile · all other tabs closed · Slack/Teams DND · cheat sheet on a **non-shared** screen

## Open (verbatim, ~30s)

> "We help enterprises recover from high-impact agent-driven changes in Microsoft Entra and Microsoft 365. When an agent changes an identity and that change cascades into permissions, data, and downstream systems, KavachIQ maps the blast radius and guides recovery in the right order."

## Walk (in order)

| # | Tab / section | Time | Beat |
|---|---|---|---|
| 1 | Site hero | ≤90s | Frame the problem |
| 2 | Comparison | 30s | Backup / observability / governance stop short |
| 3 | Scenario | 30s | Concrete Entra group change |
| 4 | `/demo` Overview | 30s | Incident context — 12 users, 5 systems |
| 5 | **Blast Radius — drill into Finance-Confidential** | **slow** | "This is real software" |
| 6 | **Recovery Plan — expand step 1** | **slow** | Identity-first sequencing becomes obvious |
| 7 | Resolution | don't rush | Confidence close — 7 verified checks |

## Phrases to use

- **trusted operational state** · **blast radius** · **identity-first recovery** · **high-impact agent-driven changes** · **rollback, restoration, and compensating actions**

## Never say

- ❌ "harmful" — say **high-impact**
- ❌ "AI governance platform" · "context engine" · "Deploy AI agents with confidence"
- ❌ "generic backup" / "better backup" / anti-Microsoft framing
- ❌ Teams **chat-message** recovery (we cover team membership / channels / permissions only)

## Top objections (one-line answers)

- *"How is this different from backup?"* — Backup restores objects. We map blast radius across identity + data and sequence recovery. Different problem.
- *"Replaces SIEM / governance?"* — No. SIEM detects, governance sets rules, we **recover** business state after a high-impact change lands. Complementary.
- *"Just a Microsoft tool?"* — Entra + M365 is the wedge. Same recovery model extends to connected enterprise systems.
- *"Detect or recover?"* — Recover. We capture what happened, map what was affected, guide back to a trusted state.

## Close (verbatim)

> "We would like to show your team a recovery scenario tailored to your Entra and Microsoft 365 environment. We will walk through a real agent-driven change, the blast radius, and how identity-first recovery gets you back to a trusted state."

## If something breaks live

- Site times out / 5xx → switch to recorded `/demo` capture (`~/demos/`)
- `/demo` interaction breaks → continue verbally with the phrases above; offer a tailored walkthrough; close early
- Post-call → file against the repo with timestamp + failing tab so the next presenter doesn't hit it
