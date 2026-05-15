# KavachIQ Demo Presenter Card

*One page. Print or pin to a second screen. Internal only.*

> Compressed view of `DEMO_CHEAT_SHEET.md` + `DEMO_SCRIPT.md`. If this card and the cheat sheet disagree, the **cheat sheet wins** — update both.

---

## Before (run every time)

1. `SITE_URL=https://agents.kavachiq.com npm run verify:seo` → **16/16**
2. Click `/demo` Overview → Blast Radius (drill) → Recovery Plan (expand) → Resolution
3. Fresh browser profile · all other tabs closed · Slack/Teams DND · cheat sheet on a **non-shared** screen

## Open (verbatim, ~30s)

> "KavachIQ is the undo button for AI-agent incidents in Microsoft 365. When an agent makes harmful changes — group memberships, sharing links, permission grants, Conditional Access exemptions — your team has minutes before the blast radius cascades. Detection tools alert you. Backup restores yesterday. KavachIQ reverses the specific changes the agent just made, in dependency order, after operator approval."

## Walk (in order)

| # | Tab / section | Time | Beat |
|---|---|---|---|
| 1 | Site hero | ≤30s | "The undo button for AI-agent incidents" — wedge in one sentence |
| 2 | Proof bar | 20s | 80/10 adoption-governance gap · $3.6B funded · Forrester quote |
| 3 | Vendor consensus | 20s | Microsoft, Salesforce, ServiceNow, Anthropic agree this layer is needed |
| 4 | Recovery gap | 30s | "Everyone detects. No one undoes." — the wedge sharpened |
| 5 | Live walkthrough animation | 30s | 4 stages cycle: alert → map → propose → approve & validate |
| 6 | Incident cards | 30s | EchoLeak, Copilot Studio AIjacking, Entra Agent ID overreach, Replit |
| 7 | Open `/demo` interactive | switch | Operator console: real software, not slides |
| 8 | **Blast Radius — drill into Finance-Confidential** | **slow** | "This is real software" |
| 9 | **Recovery Plan — expand step 1** | **slow** | Identity-first dependency ordering visible |
| 10 | Resolution | don't rush | Trusted state restored · evidence pack generated |

## Phrases to use

- **Agentic Incident Recovery** · **the undo button for AI-agent incidents** · **blast radius** · **identity-first dependency order** · **operator-approved reversal** · **trusted state restored** · **exportable evidence pack**

## Never say

- ❌ "Autonomous Assurance" or "Identity/Data Assurance" as the section names — those are the old wedge
- ❌ "AI governance platform" · "context engine" · "Deploy AI agents with confidence"
- ❌ "Generic backup" / "better backup" / anti-Microsoft framing
- ❌ Teams **chat-message** recovery (we cover team membership / channels / permissions only)
- ❌ "92 seconds" / "zero downtime" / any contractual MTTR — say "minutes, not hours"
- ❌ Implementation specifics on a buyer call — "Postgres RLS", "signed JSON", "Entra External ID" live in the procurement-detail doc, NDA-gated

## Top objections (one-line answers)

- *"How is this different from backup?"* — **Rubrik is backup. KavachIQ is undo.** Backup restores yesterday and loses every legitimate change since. We reverse only the agent's actions; everything else stays.
- *"Replaces SIEM / governance?"* — No. SIEM detects, governance sets rules, we **recover** after a change lands. We ingest from Sentinel, Defender, Purview. Complementary.
- *"Just a Microsoft tool?"* — Microsoft 365 is the wedge — that's where 80% of agentic risk lives. Q3 2026 adds Copilot Studio + Entra Agent ID. Late 2026 adds Salesforce, ServiceNow.
- *"Detect or recover?"* — Recover. Detection is mature; operational recovery is the missing layer.
- *"Operator approval model?"* — Every recovery is proposed for human review. No automated rollback. Operators approve before any change runs.

## Close (verbatim)

> "Adoption is moving faster than governance. The organizations that scale AI agents safely are the ones with a recovery posture in place *before* their first agentic incident. Bring us a scenario — we'll walk it through with your team."

## If something breaks live

- Site times out / 5xx → switch to recorded `/demo` capture (`~/demos/`)
- `/demo` interaction breaks → continue verbally with the phrases above; offer a tailored walkthrough; close early
- Post-call → file against the repo with timestamp + failing tab so the next presenter doesn't hit it
