# KavachIQ Demo Objections and Responses

Short, direct answers for the most common pushback in demos and buyer conversations.

---

## "We already have backup for Microsoft 365."

**Rubrik is backup. KavachIQ is undo.** Backup restores data to a point in time — useful for ransomware or accidental deletion. But it loses every legitimate change since the snapshot, and it can't tell you what an AI agent did to your identity, sharing, or Conditional Access surfaces. KavachIQ reverses the specific changes the agent made — preserving everything else. Different blast radius, different remediation. Most customers run both.

---

## "We already have a SIEM. Why do we need this?"

Your SIEM detects and alerts. KavachIQ picks up where detection ends. We ingest incidents from Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR — we run downstream of detection. Once the alert fires, we map the blast radius across all five Microsoft 365 surfaces (identity, sharing, permissions, Conditional Access, DLP), propose a dependency-ordered reversal plan, execute after operator approval, and validate the result. They're complementary.

---

## "We have identity governance. Is this not the same?"

Identity governance sets policies, access reviews, and approval workflows. It's **preventative** — it stops bad changes before they land. KavachIQ is **operational recovery** — it reverses changes that already landed. When an agent-driven change gets past your governance controls and causes impact, KavachIQ attributes the change to the agent's session, maps the blast radius, and guides reversal in dependency order. Different layers; both needed.

---

## "Can you do this for systems beyond Microsoft?"

Microsoft 365 is the initial focus — Microsoft's own data says 80% of agentic risk lives there. Q3 2026 adds Copilot Studio agents, Entra Agent ID coverage, and custom-agent attribution. Late 2026 adds Salesforce Agentforce and ServiceNow Now Assist. Each platform earns its place by depth, not breadth — we do Microsoft 365 better than anyone before we add anything else.

---

## "How is this different from Microsoft's own tools?"

Microsoft provides strong infrastructure: Entra audit logs, Microsoft Graph, Purview AI Observability, Microsoft 365 Backup. Each does part of the job. None of them reverse the specific actions an AI agent took without rolling back legitimate work alongside. The cross-domain reversal — identity + sharing + permissions + Conditional Access + DLP, in dependency order, after operator approval — is the layer Microsoft's native tools don't yet provide. Microsoft's own toolkit and our Purview/Sentinel integration make us complementary, not competitive.

---

## "Is this a real product or still a concept?"

The platform is operational. The site you're looking at reflects the current product scope. We run demos with representative recovery scenarios in a Microsoft 365 tenant — alert ingestion, blast radius mapping, identity-first reversal proposal, operator approval, validation, evidence pack. Bring a scenario; we'll walk it through.

---

## "What if agents are not a real risk for us yet?"

Microsoft reports 80% of the Fortune 500 use AI agents in production today. Only 10% have a governance program. Even without autonomous agents in your stack, Power Platform flows, Copilot, Copilot Studio, and third-party integrations already make changes to Entra and Microsoft 365 that can have unintended consequences. Forrester says an agentic AI public breach is not a question of whether, but which organization will be first. The risk is operational, not hypothetical.

---

## "What is your pricing model?"

We're in early conversations and tailoring pricing to scope and environment. The right next step is a recovery walkthrough so we can understand your Microsoft 365 footprint, the surfaces in scope, and the operator approval model that fits your team. Pricing reflects the IR / DFIR budget line, not the backup budget — different problem, different category.

---

## "Who else is using this?"

We're in early deployment conversations with enterprises running Microsoft 365 at scale. We're not sharing customer names publicly yet, but the demo walkthrough shows you exactly what the product does in a realistic Microsoft 365 scenario.

---

## "What data do you access? What are the privacy implications?"

KavachIQ reads from Microsoft Graph — today, scoped to `AuditLog.Read.All` and `Directory.Read.All`, admin-consented per tenant. We capture change metadata: what changed, the agent session that initiated it, the before/after state. We do not store your business document content. Tenant isolation is enforced at the data layer; KavachIQ operators have no cross-tenant visibility. The detailed scope inventory and security architecture is available under NDA — the marketing site keeps the trust posture outcome-led; procurement gets the implementation specifics.

---

## "What's the operator approval model?"

Every recovery is proposed for human review. **No automated rollback. The platform does not act on its own.** Operators see the full proposed reversal — every step and its dependency — before any change runs. Approval is an explicit, scoped action. Partial approval (a subset of the plan) is supported. Each step is validated against expected state after execution.
