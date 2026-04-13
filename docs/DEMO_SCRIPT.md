# KavachIQ Demo Script

**Version:** Demo-ready baseline
**Site:** staging.kavachiq.com
**Last updated:** April 2026

---

## 1. 30-Second Company Pitch

> AI agents and automation are starting to change identities, permissions, and business data across enterprise systems. When those changes are high-impact, enterprises need to understand what was affected, map the blast radius, and recover in the right order.
>
> KavachIQ Autonomous Assurance is the recovery layer for high-impact agent-driven changes. We help teams map blast radius across Microsoft Entra and Microsoft 365, sequence identity-first recovery, and guide rollback, restoration, and compensating actions back to a trusted operational state.
>
> We start with Microsoft Entra and Microsoft 365. Over time, the same recovery model extends to connected enterprise systems.

**When to use:** elevator conversations, networking, cold intros, advisor catch-ups.

---

## 2. Two-Minute Website Walkthrough

Use this when screen-sharing the staging site in a short call or meeting.

**Open staging.kavachiq.com.**

### Hero (10 seconds)

"This is KavachIQ Autonomous Assurance. We help enterprises recover from high-impact agent-driven changes. The initial focus is Microsoft Entra and Microsoft 365."

Point to: headline, eyebrow badge, three support cards (Identity-first, Data-aware, Recovery-led).

### Problem section (20 seconds)

Scroll to the problem section.

"AI agents can now change users, modify groups, alter app registrations, update Conditional Access policies, and trigger workflows across your Entra and Microsoft 365 environment. Some of those changes will be unintended, risky, or malicious. When that happens, teams need to understand the full scope of impact and recover in the right order."

Point to: the four problem cards (Identity changes, Permission drift, Data impact, Cross-system fallout).

### Comparison (20 seconds)

Scroll to the comparison table.

"Backup restores objects but has no blast-radius mapping. Observability shows what happened but cannot restore state. Governance sets rules but cannot unwind change once it lands. KavachIQ is the missing layer: we map blast radius and guide rollback, restoration, and compensating actions."

Point to: the four comparison rows, with KavachIQ highlighted.

### Recovery scenario (30 seconds)

Scroll to the example scenario.

"Here is what recovery looks like in practice. An agent modifies an Entra group membership. KavachIQ captures the change, maps the blast radius across SharePoint, Exchange, Conditional Access, and downstream apps, then sequences recovery so identity is restored before data."

Point to: the status rail and the 5-step timeline (Incident, Capture, Assess, Recover, Resolved).

### CTA (10 seconds)

Scroll to the demo request section.

"We are offering tailored recovery scenario walkthroughs. The demo shows a real Entra change, blast-radius mapping, and identity-first recovery sequencing."

---

## 3. Five-Minute Product Narrative

Use this for longer advisor calls, investor conversations, or first buyer meetings where you need to explain the product clearly.

### The setup (1 minute)

"Enterprises are deploying AI agents and automation that can change identities, permissions, configurations, and business data. These are not hypothetical changes. Agents can create users, modify group memberships, alter app registrations, change Conditional Access policies, update SharePoint permissions, and trigger workflows across Microsoft 365."

"Some of those changes will be high-impact. They could be unintended side effects of a well-meaning automation, risky configuration drift, or deliberate misuse."

### The gap (1 minute)

"When that happens, existing tools each solve part of the problem. Backup can restore individual objects, but it does not know what an agent changed, cannot map blast radius across identity and data, and has no concept of recovery sequencing. Observability shows what happened, but it cannot restore business state. Governance sets rules, but it cannot unwind a change once it lands."

"No existing tool maps the blast radius of an agent-driven identity change across Entra and Microsoft 365, sequences recovery in the right order, and coordinates rollback and compensating actions across systems."

### What KavachIQ does (1 minute)

"KavachIQ Autonomous Assurance is the recovery layer. We capture agent-driven changes with full context: the initiating agent, workflow session, target object, and before/after state. We map blast radius across Entra identity objects, Microsoft 365 workloads, and connected systems. And we guide rollback, restoration, and compensating actions with identity-first sequencing."

"The key insight is that identity is the control plane. If an agent changes an Entra group membership, that change cascades into SharePoint permissions, Exchange delegations, Teams collaboration, Conditional Access scope, and downstream app provisioning. Recovering data before restoring identity trust means recovering on a broken foundation. KavachIQ sequences recovery so identity is restored first."

### The wedge (1 minute)

"We start with Microsoft Entra and Microsoft 365 because that is where the most damage happens fastest. Entra controls who has access to what. Microsoft 365 is where business impact shows up: SharePoint, OneDrive, Exchange, Teams. When identity and data both change, recovery must be coordinated across both."

"Over time, the same capture, assess, and recover model extends to connected enterprise systems and adjacent SaaS platforms."

### The ask (1 minute)

"We are showing tailored recovery scenarios in demos. We walk through a real agent-driven Entra change, show the blast radius across Microsoft 365, and demonstrate how identity-first recovery sequencing works. The goal is for your team to see what recovery looks like in their environment."

---

## 4. Ten-Minute Demo Flow

Use this for structured buyer demos, technical evaluations, or detailed investor walkthroughs.

### Minute 0-1: Context

"Thank you for the time. Let me show you what KavachIQ does and why it matters for your Entra and Microsoft 365 environment."

Open staging.kavachiq.com. Walk through the hero briefly.

"KavachIQ Autonomous Assurance helps enterprises recover from high-impact agent-driven changes. We map blast radius and guide identity-first recovery."

### Minute 1-3: The problem

Scroll to the problem section.

"AI agents and automation are starting to make real changes to enterprise identity and data. Let me show you what that looks like."

Walk through the four problem cards:
- "Identity changes: agents can create users, modify groups, alter service principals, change app registrations, and update Conditional Access policies."
- "Permission drift: those identity changes cascade into role assignments, downstream provisioning, and access scope."
- "Data impact: SharePoint sites, OneDrive content, Exchange mailboxes, Teams collaboration, and permission settings are all affected."
- "Cross-system fallout: a single Entra change can cascade into Microsoft 365, connected apps, and downstream business systems."

### Minute 3-4: Why existing tools fall short

Scroll to the comparison section.

"Most enterprises have backup, observability, and governance. Each of those solves part of the problem. None of them solve recovery."

Walk through each row briefly:
- "Backup restores objects but has no blast-radius mapping or recovery sequencing."
- "Observability shows what happened but cannot restore business state."
- "Governance sets rules but cannot unwind a change once it lands."
- "KavachIQ maps blast radius and guides rollback, restoration, and compensating actions."

### Minute 4-6: The recovery scenario

Scroll to the example recovery scenario.

"Let me walk you through a concrete example."

Walk through each step:
1. "An agent modifies an Entra group membership. It adds 12 users to a privileged security group. Those users now have access to sensitive SharePoint sites, Exchange mailboxes, and a downstream LOB application."
2. "KavachIQ captures the change with full context: the initiating agent, workflow session, target group, added members, and before/after state."
3. "We map the blast radius. The group change affected 3 SharePoint site collections, 12 Exchange mailbox delegations, Conditional Access policy scope, and one downstream app provisioning flow."
4. "KavachIQ recommends reverting the Entra group membership first, then revoking the downstream SharePoint and Exchange access, then verifying the Conditional Access policy is restored, then confirming the LOB app provisioning state."
5. "The team returns to a trusted operational state with a full audit trail."

Point to the status rail: "This is the recovery progression: Agent action, Identity impact, Blast radius, Recovery sequence, Trusted state."

### Minute 6-7: Identity-first recovery

Scroll to the identity-first section.

"The key architectural insight is that identity must be recovered before data. If you restore a mailbox before fixing the identity that was used to compromise it, you leave the door open."

"KavachIQ sequences recovery so Entra identity trust is restored first. Then Microsoft 365 data and collaboration surfaces. Then downstream systems."

### Minute 7-8: Product scope

Scroll to the product pillars.

"We have three pillars."
- "Identity Assurance for Microsoft Entra: users, groups, app registrations, service principals, Conditional Access, and role assignments."
- "Data Assurance for Microsoft 365: SharePoint, OneDrive, Exchange, Teams collaboration, and permissions."
- "Cross-System Assurance: connecting incident timelines across systems of record, with the same model extending to adjacent platforms over time."

### Minute 8-9: How it works

Scroll to How It Works.

"The workflow is three steps: capture agent-driven change, map blast radius, guide safe recovery. It is built for operators, not passive monitoring."

### Minute 9-10: CTA and next steps

Scroll to the demo section.

"What we would like to do next is walk your team through a recovery scenario tailored to your environment. We will show you how KavachIQ handles a real agent-driven Entra change in the context of your Microsoft 365 setup."

"The form is right here, or I can send you a direct link."

---

## 5. Expected Buyer Questions

### From CISOs

- "How is this different from our existing backup solution?"
- "Does this replace our SIEM or SOAR?"
- "What happens if the agent change is malicious, not just accidental?"
- "How do you handle Conditional Access policy changes specifically?"
- "What is the blast-radius model based on?"
- "Can we define recovery policies or does the system recommend them?"

### From CIOs / Heads of IT

- "How does this fit into our existing Microsoft stack?"
- "What is the deployment model?"
- "How quickly can we get this into staging?"
- "Does this work with our existing identity governance tools?"
- "What does the roadmap look like beyond Entra and Microsoft 365?"

### From Identity / Entra Admins

- "Does this cover service principals and app registrations?"
- "How do you handle nested group membership changes?"
- "Can I see the before/after state for a Conditional Access policy change?"
- "Does this integrate with Entra audit logs?"
- "Can I control which recovery actions require manual approval?"

### From Microsoft 365 Admins

- "Does this cover SharePoint permissions specifically?"
- "What about Exchange mailbox delegations?"
- "How do you handle Teams team membership and channel changes?"
- "Can I see which files or sites were affected by an identity change?"
- "Does this work with Microsoft 365 retention policies?"

---

## 6. Suggested Answers

### "How is this different from backup?"

"Backup restores individual objects or systems. It does not know what an agent changed, cannot map blast radius across identity and data, and has no concept of recovery sequencing. KavachIQ maps what was affected, understands the dependency order, and guides rollback, restoration, and compensating actions so identity is restored before data."

### "Does this replace our SIEM?"

"No. Your SIEM detects and alerts. KavachIQ picks up where detection ends. Once you know something happened, KavachIQ helps you understand the full blast radius and recover safely. They are complementary."

### "What about malicious changes?"

"The recovery workflow is the same whether the change was accidental, risky, or malicious. KavachIQ captures the change with full context, maps blast radius, and guides recovery. For malicious changes, the audit trail and before/after state are especially important for incident response and forensics."

### "Does this cover Conditional Access?"

"Yes. Conditional Access policies are first-class objects in the identity surface we track. When an agent modifies a Conditional Access policy, KavachIQ captures the change, maps the downstream access impact, and sequences recovery alongside user, group, and service principal changes."

### "How does this fit into our Microsoft stack?"

"KavachIQ works with your existing Entra and Microsoft 365 environment. It reads from Entra audit logs and Microsoft Graph. It does not replace your identity governance or compliance tools. It adds the recovery layer that those tools do not provide."

### "What about Teams?"

"We cover Teams at the collaboration and access layer: team membership, channel structure, and permission changes. We do not claim to recover individual Teams chat messages. The focus is on the identity and permission changes that affect Teams collaboration, not message-level content."

### "What is the deployment model?"

"Cloud-hosted. We integrate with your Entra and Microsoft 365 tenant through standard Microsoft Graph APIs. Deployment is lightweight and does not require agents or infrastructure changes."

### "What is the roadmap beyond Microsoft?"

"Microsoft Entra and Microsoft 365 are the initial wedge. The same capture, assess, and recover model is designed to extend to connected enterprise systems and adjacent SaaS platforms as agent-driven automation expands. We are starting where the most damage happens fastest."

---

## 7. What Not to Say

### Do not overclaim Teams recovery
- Do not say: "We recover Teams chat messages" or "We restore Teams conversations."
- Do say: "We cover Teams at the collaboration and access layer: team membership, channel structure, and permissions."

### Do not position as generic backup
- Do not say: "We are a better backup for Microsoft 365."
- Do say: "We are the recovery layer that backup does not provide. Backup restores objects. We map blast radius and guide recovery sequencing."

### Do not position as generic AI governance
- Do not say: "We govern AI agents" or "We control what agents can do."
- Do say: "We help enterprises recover when agent-driven changes are high-impact. Governance sets rules. KavachIQ helps when those rules are not enough."

### Do not use anti-Microsoft framing
- Do not say: "Microsoft does not protect your data" or "Microsoft backup is inadequate."
- Do say: "Microsoft provides strong identity and collaboration infrastructure. KavachIQ adds the recovery layer for agent-driven change across that infrastructure."

### Do not sound like a vague AI platform
- Do not say: "We provide AI-powered insights" or "Our AI engine analyzes your environment."
- Do say: "We capture agent-driven changes, map blast radius, and guide recovery. The value is operational, not analytical."

### Do not make unsupported claims
- Do not say: "We prevent all agent-driven incidents."
- Do say: "We help enterprises recover safely when high-impact agent-driven changes occur."

### Do not use stale messaging
- Do not say: "Deploy AI agents with confidence."
- Do not say: "Harmful agent-driven change."
- Do say: "Recover from high-impact agent-driven changes."
- Do say: "Return to a trusted operational state."
