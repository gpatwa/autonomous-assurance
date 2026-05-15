# KavachIQ — Agentic Incident Recovery

**The undo button for AI-agent incidents in Microsoft 365.**

When an AI agent makes harmful changes, your team has minutes before the blast radius cascades across identity, sharing, permissions, and data. KavachIQ attributes every change to the agent's session and guides your operators through approval-gated, dependency-ordered reversal — with full audit.

Built first for Microsoft 365 — where 80% of agentic risk lives today.

---

## The problem

AI agents in Microsoft 365 — Copilot, Copilot Studio, custom Entra-registered agents — now take real actions: create users, modify group memberships, add app or service principal owners, change Conditional Access policies, alter sharing on SharePoint and OneDrive, modify DLP labels, and trigger workflows across Microsoft 365.

Some of those actions will be harmful: unintended side effects of a well-meaning automation, prompt injection, model misbehavior, or compromised agent identity. When that happens, the enterprise has minutes to reverse the cascade before it spreads.

**Microsoft itself reports that 80% of the Fortune 500 use AI agents in production. Only 10% have a governance program.**

## Where existing tools stop short

| Layer | What it does | What it can't do |
|---|---|---|
| **Detection** (Purview, Defender, Sentinel, Zenity, WitnessAI) | Tells you something happened | Doesn't reverse the change |
| **Backup** (Microsoft 365 Backup, Rubrik, Cohesity, Veeam) | Restores data to a point in time | Loses every legitimate change since the snapshot. Can't surgically reverse the agent's specific actions |
| **Governance** (Purview policies, Entra access reviews) | Sets rules and approvals before the fact | Can't unwind a high-impact change once it lands |

No existing layer reverses **the specific actions an AI agent took** without rolling back legitimate work alongside.

## What KavachIQ does

The four-step operational flow:

1. **Connect to your detection layer.** KavachIQ ingests incidents from Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR. We run downstream of detection — your existing alert posture stays in place.
2. **Map the blast radius.** Every identity, sharing, permission, Conditional Access, and DLP change attributed to the agent's session — modeled as a single dependency graph per incident.
3. **Propose an identity-first reversal plan.** Dependency-ordered: identity changes first, then permissions, then sharing and Conditional Access, then data. Revoking access does not lock out a Global Admin; undoing a share does not break an active collaboration.
4. **Approve, execute, and validate.** Your operator reviews and approves the plan before any change runs. Every step is validated against expected state. An exportable evidence pack is generated for the auditor, the board, and the post-mortem.

## Trust and tenant safety

KavachIQ is designed to operate inside enterprise environments under operator and CISO oversight.

- **Approval-gated reversal.** No automated rollback. The platform does not act on its own.
- **Least-privilege Microsoft access.** Admin-consented per tenant, scoped to the surfaces under recovery management.
- **Tenant-scoped isolation.** Per-tenant data and access boundaries enforced at the data layer, with tenant-bound key material.
- **Audit trail and evidence pack.** Every step recorded with operator identity, timestamp, and outcome — exportable for audit, SIEM ingest, and board reporting.

## Why Microsoft 365 first

**Microsoft Entra is the control plane.** Every permission, access path, and downstream system depends on the integrity of the identity layer. When an agent changes a user, group, service principal, or Conditional Access policy, the impact cascades through every connected Microsoft 365 surface.

**Microsoft 365 is where business impact shows up.** SharePoint, OneDrive, Exchange, and Teams collaboration are the surfaces where identity-driven changes create operational disruption.

**Recovery order matters.** Restoring data before identity trust means recovering on a broken foundation. KavachIQ sequences identity first, then permissions, sharing, and Conditional Access, then data.

## Product scope today

**Agentic Identity Recovery for Microsoft Entra**
- Users and groups (privileged group membership, lifecycle, ownership)
- Apps and service principals (registrations, ownership, credentials, OAuth consents)
- Conditional Access policies (scope, conditions, exemptions, sign-in risk)
- Directory role assignments

**Agentic Data Recovery for Microsoft 365**
- SharePoint and OneDrive sharing, permissions, and item-level access
- Exchange mailbox delegations, send-as, inbox rules, transport rules
- Teams team membership, channel permissions, guest access
- DLP and sensitivity labels

**Roadmap**
- Today: Entra + Microsoft 365 (shipped)
- Q3 2026: Copilot Studio agents · Entra Agent ID · custom-agent attribution
- Late 2026: Salesforce Agentforce · ServiceNow Now Assist · adjacent agent platforms

## What a buyer sees in a demo

A walkthrough of a representative recovery scenario:

1. An AI agent makes dozens of changes in a Microsoft 365 tenant — group memberships, sharing links, permission grants, Conditional Access exemptions
2. KavachIQ attributes each change to the agent's session and proposes a dependency-ordered reversal plan
3. The operator reviews the proposed plan and approves
4. Each reversal step executes and is validated against expected state
5. An exportable evidence pack is generated — ready for the auditor, the board, and your post-mortem

## Why it matters now

Forrester says an agentic AI public breach is not a question of whether, but which organization will be first. Adoption is moving faster than governance. The organizations that scale AI agents safely will be the ones with a recovery posture in place **before** their first agentic incident — not after.

## Next step

**Request a tailored recovery scenario walkthrough at [agents.kavachiq.com](https://agents.kavachiq.com).**

We will walk through how KavachIQ handles an agent-driven change in the context of your Microsoft 365 environment.

---

### Common first questions

- **How is this different from backup?** Backup restores data to a point in time. KavachIQ reverses only the agent's actions — preserving every legitimate change that happened alongside. *"Rubrik is backup. KavachIQ is undo."*
- **Does this replace our SIEM or governance tools?** No. Your SIEM detects. Your governance sets rules before the fact. KavachIQ recovers business state after agent-driven changes land. We run downstream of detection, complementary to backup.
- **What scopes do you need in our tenant?** Today (read-only): `AuditLog.Read.All` and `Directory.Read.All` via Microsoft Graph, admin-consented per tenant. Write scopes for reversal are provisioned only after a customer enables platform-driven reversal. Detailed scope inventory available on request.
- **What is covered in Entra?** Users, groups, app registrations, service principals, Conditional Access policies, and role assignments.
- **How do you handle Teams?** Team membership, channel structure, channel permissions, and guest access. Not individual chat message recovery.
- **What does deployment look like?** Cloud-hosted. Microsoft Graph integration. No agents installed in your environment, no infrastructure changes required.
- **What's the operator approval model?** Every recovery is proposed for human review. No automated rollback. Operators approve the full plan or a subset before any change runs.
- **What's on the roadmap?** Microsoft Entra and Microsoft 365 first. Copilot Studio + Entra Agent ID coverage in Q3 2026. Salesforce Agentforce + ServiceNow Now Assist late 2026.
