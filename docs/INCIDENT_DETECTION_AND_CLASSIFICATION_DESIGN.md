# Incident Detection and Classification Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Connector and Ingestion Design, Blast-Radius Engine Design, Recovery Orchestration Design, Operator UI and API Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

The incident detection and classification layer turns raw normalized changes and correlated bundles into actionable incidents that operators can triage and that downstream systems (blast-radius engine, recovery planner) can process. This is the triage layer of the product. If it is too noisy, operators ignore it. If it is too quiet, high-impact changes go unrecovered.

**Core problem:** Not every change is an incident. An enterprise Entra tenant generates thousands of identity changes daily. The system must identify the small fraction that represent high-impact agent-driven changes worth investigating and recovering from, without suppressing real incidents or spamming operators with noise.

**Recommended model:** A two-stage detection pipeline. Stage 1 (ingestion layer, already designed) produces correlated change bundles with preliminary scores. Stage 2 (this layer) evaluates each bundle against tenant-specific sensitivity policies and risk signals to produce either an **incident candidate** (for ambiguous signals) or a **confirmed incident** (for clearly high-impact changes). Candidates that are not promoted to incidents within a configurable window are suppressed. Confirmed incidents immediately trigger blast-radius analysis. Severity, urgency, and confidence are tracked as three separate dimensions, not collapsed into one score. Late-arriving evidence can promote a candidate to an incident or upgrade an existing incident's severity.

**Key trade-offs:**
- Two-stage detection adds latency for ambiguous changes but dramatically reduces false-positive incidents
- Separate severity/urgency/confidence dimensions add complexity but give operators much better decision-making context
- Tenant-specific sensitivity lists add configuration burden but eliminate the impossible task of universally correct default thresholds

---

## 2. Problem Statement

### Why incident detection is hard

**Not every change is an incident.** An enterprise might have 500 group membership changes per day from legitimate provisioning, lifecycle events, and manual administration. Treating every change as an incident produces hundreds of false positives and destroys operator trust within a week.

**One logical incident produces many low-level changes.** An agent adding 12 users to a group generates 12 individual audit events, a webhook notification, and a snapshot diff. These must be correlated into one logical change before incident classification, not classified 14 times independently.

**High-impact changes are not always obvious from the raw event.** Adding a user to a group is routine. Adding a user to the "Finance-Privileged-Access" group is potentially high-impact. The system must know which groups matter, which requires tenant-specific configuration.

**Microsoft telemetry is delayed.** Entra audit logs arrive 2-15 minutes late. M365 unified audit can be 24 hours late. The incident system must decide whether to create an incident from partial evidence now or wait for more data. Both options have costs.

**Confidence in "a change happened" differs from confidence in "this is an incident."** A high-confidence normalized change (confirmed by audit log with before/after state) may still be a low-confidence incident candidate (was this actually harmful or just routine administration?). The system must track both dimensions.

**Self-actions must not create incidents.** KavachIQ's own recovery writes generate audit events. Without suppression, every recovery action creates a new incident, producing an infinite feedback loop.

---

## 3. Design Goals

1. **Convert correlated change bundles into actionable incidents.** Not every bundle becomes an incident. The system must classify and filter.
2. **Support immediate and deferred incident creation.** Clearly high-impact changes become incidents immediately. Ambiguous changes become candidates that may be promoted or suppressed.
3. **Separate severity, urgency, and confidence.** These are different dimensions. Collapsing them produces undifferentiated alert fatigue.
4. **Suppress noise without hiding real incidents.** Self-actions, routine provisioning, and low-sensitivity changes are suppressed. Suppression decisions are auditable.
5. **Handle late-arriving evidence.** Incidents can be created, upgraded, or merged as new data arrives. The first view is rarely the final view.
6. **Support tenant-specific sensitivity configuration.** What is high-impact in one enterprise may be routine in another. The system must support configurable sensitivity lists.
7. **Provide explainable classification rationale.** Operators must be able to see why something became (or did not become) an incident.
8. **Hand off cleanly to blast-radius and recovery systems.** Incidents carry enough context for downstream processing.

---

## 4. Non-Goals and Boundaries

- **Not a general anomaly detection ML platform in v1.** Detection is rule-based and score-based, not statistical or ML-driven. ML-based detection is a v2+ enhancement.
- **Not malware or threat attribution.** The system detects high-impact changes, not threat actors. It does not classify intent.
- **Not full UEBA.** The system does not build behavioral baselines of normal user activity. It compares changes against configured sensitivity policies.
- **Not broad SIEM alert correlation.** The system correlates identity and permission changes from Microsoft sources only, not security alerts from other tools.
- **Not requiring full blast-radius analysis before incident creation.** Incidents are created from change signals. Blast-radius analysis is triggered after the incident exists, not as a prerequisite.

---

## 5. Core Concepts and Terminology

| Term | Definition |
|------|-----------|
| **Normalized change** | A deduplicated, confidence-tagged change record from the ingestion pipeline |
| **Correlated change bundle** | A group of related normalized changes clustered by actor/session/target/time from the ingestion layer |
| **Incident candidate** | A change bundle that scores above the detection threshold but is not yet confirmed as an actionable incident |
| **Incident** | A confirmed, operator-visible event representing one or more high-impact changes that warrant investigation and potential recovery |
| **Root change** | The primary change(s) that triggered the incident (e.g., group membership modification) |
| **Severity** | The estimated potential impact if the change is not recovered (critical / high / medium / low) |
| **Urgency** | How quickly operator attention is needed (immediate / within-hour / within-day / informational) |
| **Confidence** | How strongly the system believes this is a real incident worth action (high / medium / low) |
| **Signal quality** | The reliability and completeness of the telemetry supporting the classification |
| **False positive** | A change classified as an incident that was actually benign (routine administration, expected automation) |
| **Late-arriving evidence** | Additional telemetry (audit events, M365 data) that arrives after initial classification |
| **Suppressed event** | A change bundle that was evaluated and determined not to be an incident; logged but not operator-visible |
| **Merged incident** | Two or more incident candidates or incidents combined because they represent the same logical event |
| **Superseded incident** | An incident replaced by a merged or reclassified incident |
| **Sensitivity list** | A tenant-configured list of objects (groups, policies, apps) classified by impact level |

---

## 6. Detection Model Options

### Option A: Pure Rule-Based

**How it works:** A fixed set of rules maps change types to incident creation. Example: "If group.sensitivityLevel == 'high' AND changeType == 'memberAdded' AND actor.type == 'application', create incident."

| Dimension | Assessment |
|-----------|-----------|
| Precision | Good for known patterns. Poor for novel patterns. |
| Complexity | Low. Rules are explicit and debuggable. |
| False positives | Moderate. Rules are coarse; many legitimate app-driven changes will match. |
| False negatives | High for patterns not covered by rules. |
| v1 fit | Viable as a starting point but insufficient alone. |

### Option B: Score-Threshold Candidate Model

**How it works:** Each change bundle receives a composite score from multiple signals (actor type, target sensitivity, bulk magnitude, time pattern). Bundles scoring above a threshold become incident candidates. A second threshold promotes candidates to confirmed incidents.

| Dimension | Assessment |
|-----------|-----------|
| Precision | Better than pure rules. Multi-dimensional scoring catches more subtle patterns. |
| Complexity | Medium. Scoring weights must be calibrated. |
| False positives | Lower than pure rules. Scoring allows finer discrimination. |
| False negatives | Lower than pure rules. Scoring catches partial-match patterns. |
| v1 fit | Good. Scoring model is tunable without code changes. |

### Option C: Two-Stage Candidate → Incident Pipeline (Recommended)

**How it works:** Stage 1 (from ingestion) produces correlated bundles with preliminary scores. Stage 2 evaluates each bundle against tenant-specific sensitivity policies and risk signals. High-confidence, high-impact bundles become incidents immediately. Ambiguous bundles become candidates. Candidates that are not promoted within a configurable window (default: 30 minutes) are suppressed or downgraded to informational.

| Dimension | Assessment |
|-----------|-----------|
| Precision | Best available. Two evaluation stages with different signal sets. |
| Complexity | Medium-high. Two stages, candidate lifecycle management, promotion/suppression logic. |
| False positives | Lowest. Candidate stage absorbs ambiguous signals before they reach operators. |
| False negatives | Low. Late-arriving evidence can promote suppressed candidates. |
| v1 fit | **Recommended.** Best balance of precision, safety, and operator trust. |

### Comparison

| | Pure Rules | Score-Threshold | Two-Stage (Recommended) |
|-|-----------|----------------|------------------------|
| Precision | Low | Medium | High |
| False positives | High | Medium | Low |
| Operator trust | Low | Medium | High |
| Configuration burden | Low | Medium | Medium (sensitivity lists) |
| v1 recommendation | No | Partial use | **Yes** |

---

## 7. Recommended Detection and Classification Model

### Two-Stage Pipeline

```
Correlated Change Bundle (from ingestion)
  │
  ▼
┌──────────────────────────────┐
│  STAGE 1: RAPID ASSESSMENT   │
│                              │
│  Is this clearly high-impact?│
│  ├── YES → Create INCIDENT   │──▶ Blast-radius analysis triggered
│  │         immediately       │
│  ├── MAYBE → Create          │
│  │    CANDIDATE              │──▶ Await correlation/evidence
│  └── NO → SUPPRESS           │──▶ Log only, not operator-visible
│                              │
└──────────────────────────────┘

         (for candidates)
              │
              ▼
┌──────────────────────────────┐
│  STAGE 2: CONFIRMATION       │
│  (within correlation window) │
│                              │
│  New evidence arrives?       │
│  ├── Strengthens → PROMOTE   │──▶ Create INCIDENT
│  │    to incident            │
│  ├── Weakens → SUPPRESS      │──▶ Log only
│  └── No change → TIMEOUT     │
│       ├── Score still high → │──▶ Create INCIDENT
│       │    PROMOTE            │
│       └── Score decayed →    │──▶ SUPPRESS
│            SUPPRESS           │
└──────────────────────────────┘
```

### When to Create an Incident Immediately

A correlated change bundle becomes an incident immediately (bypass candidate stage) when **all** of the following are true:
- Target object is on the tenant's high-sensitivity list (privileged group, CA policy, directory role)
- Actor is a non-human identity (application, service principal, or known agent)
- Change type is a membership, assignment, or policy modification
- Magnitude exceeds a threshold (e.g., >3 members added, or any change to a CA policy)

### When to Create a Candidate

A bundle becomes a candidate (not yet an incident) when:
- Some but not all immediate-incident criteria are met
- Preliminary score from ingestion is >= 50 but < 80
- The change involves a medium-sensitivity object
- The actor type is ambiguous (could be human or automation)

### When to Suppress

A bundle is suppressed (logged but not operator-visible) when:
- It is flagged as a self-action (KavachIQ's own recovery writes)
- The target object is not on any sensitivity list and the actor is a known legitimate automation
- The change type is a low-impact property modification (displayName, description)
- The score is below 30

---

## 8. Microsoft-First v1 Detection Scope

### In-Scope Change Types

| Change Type | Detection Level | Confidence | Notes |
|------------|----------------|-----------|-------|
| **Privileged group membership add/remove** | Immediate incident (if >3 members by non-human actor) or candidate | High (audit log with before/after) | Core v1 scenario |
| **Directory role assignment add/remove** | Immediate incident | High | Any non-human modification of Global Admin, Privileged Role Admin, etc. |
| **CA policy targeting change** | Immediate incident | High | Group assignment scope changes are high-impact |
| **CA policy creation/deletion** | Immediate incident | High | Rare and high-impact |
| **App role assignment change** | Candidate | Medium | Depends on app sensitivity (requires app sensitivity list) |
| **Service principal credential modification** | Candidate or immediate (if privileged SP) | Medium-high | Adding a credential to a privileged SP is a significant event |
| **Bulk user attribute modification by agent** | Candidate | Medium | May indicate lifecycle workflow issue; depends on attribute and scale |
| **SharePoint site permission change** | Candidate (delayed detection via M365 audit) | Low-medium | M365 audit latency limits confidence; useful when it arrives |
| **Non-sensitive group membership change** | Suppressed (unless bulk by non-human) | N/A | High volume; not actionable unless part of a larger pattern |

### Object Sensitivity Classification

The system requires tenant-configured sensitivity lists for:

| List | Purpose | Examples |
|------|---------|---------|
| **High-sensitivity groups** | Groups whose membership change is always an incident | Finance-Privileged-Access, Global-Admin-Access, Security-Operations |
| **High-sensitivity apps** | Applications whose role assignments are always investigated | SAP Finance, Azure Management, Custom LOB apps with financial access |
| **High-sensitivity policies** | CA policies whose modification is always an incident | MFA-Bypass policies, DLP exception policies, Admin-access policies |
| **Known agent identities** | Service principals identified as AI agents or automation | Access Lifecycle Agent, Power Platform flows, custom automation SPs |
| **Excluded identities** | Service principals whose changes are always suppressed | Azure AD Connect sync, known provisioning connectors, KavachIQ SP-Execute |

---

## 9. Signal and Scoring Model

### Signal Dimensions

| Signal | Affects | Weight Range | Source |
|--------|---------|-------------|--------|
| **Actor is non-human** | Severity, Urgency | +25-35 | `actor.type` == application/servicePrincipal |
| **Actor is on known-agent list** | Severity | +10-15 | Tenant sensitivity list match |
| **Target is high-sensitivity** | Severity, Urgency | +30-40 | Sensitivity list match |
| **Target is medium-sensitivity** | Severity | +15-20 | Sensitivity list match |
| **Change type is membership/assignment** | Severity | +10-15 | `changeType` field |
| **Bulk magnitude (>5 objects affected)** | Severity, Urgency | +15-25 | Bundle `affectedObjects` count |
| **Time clustering (burst pattern)** | Confidence | +5-10 | Changes within <30 seconds |
| **Cross-system evidence** | Confidence | +10-15 | Bundle includes changes across >1 system category |
| **Baseline conflict** | Severity | +10-20 | Changed state conflicts with approved baseline |
| **Self-action** | Suppression | -100 (suppress) | `selfAction` flag |
| **Known excluded identity** | Suppression | -100 (suppress) | Exclusion list match |
| **Low telemetry confidence** | Confidence penalty | -10-20 | `confidence.level` == low |
| **CA policy modification** | Severity, Urgency | +35-40 | `changeType` includes CA policy |
| **Directory role change** | Severity, Urgency | +35-40 | `changeType` includes role assignment |

### Scoring Thresholds

| Score Range | Classification | Action |
|-------------|---------------|--------|
| 80-100 | **Immediate incident** | Create incident; trigger blast-radius analysis |
| 50-79 | **Incident candidate** | Create candidate; await correlation window |
| 30-49 | **Informational** | Log for audit; not operator-visible |
| 0-29 | **Suppressed** | Log only; excluded from downstream |
| Negative (self-action/excluded) | **Suppressed** | Log with suppression reason |

### Severity Assignment

Severity is computed from the scoring signals but mapped to discrete levels:

| Level | Criteria | Operator Expectation |
|-------|---------|---------------------|
| **Critical** | Directory role modified by non-human + high-sensitivity target | Immediate investigation required |
| **High** | Privileged group membership bulk change by agent OR CA policy modification | Investigation within 30 minutes |
| **Medium** | Medium-sensitivity target change OR app role modification | Investigation within 4 hours |
| **Low** | Low-sensitivity target with moderate signal strength | Investigation within 24 hours |

### Urgency Assignment

Urgency is derived from severity but can be modified:

| Modifier | Effect on Urgency |
|----------|------------------|
| Active access expansion confirmed | Urgency +1 level |
| Change is read-only/informational | Urgency -1 level |
| Operator has already triaged a related incident | Urgency -1 level |
| Blast-radius analysis reveals broad impact | Urgency +1 level (post-analysis upgrade) |

### Confidence Assignment

| Level | Meaning | Basis |
|-------|---------|-------|
| **High** | Strong evidence that this is a real, high-impact change | Authoritative audit log with before/after state, target confirmed on sensitivity list, non-human actor confirmed |
| **Medium** | Probable incident but some signals are weak or incomplete | Audit log without before-state, or medium-sensitivity target, or actor type ambiguous |
| **Low** | Possible incident but significant uncertainty | Snapshot-diff-only observation, or delayed M365 telemetry, or actor classification uncertain |

---

## 10. Candidate vs Incident State Model

```
                    ┌───────────────┐
                    │  bundle       │ From ingestion
                    │  received     │
                    └───────┬───────┘
                            │ scoring + classification
                ┌───────────┼───────────┐
                │           │           │
         ┌──────▼───┐ ┌────▼─────┐ ┌───▼────────┐
         │suppressed│ │candidate │ │ incident   │ (immediate)
         └──────────┘ └────┬─────┘ │ created    │
                           │       └──────┬─────┘
                  ┌────────┼────────┐     │
                  │        │        │     │
            ┌─────▼──┐ ┌──▼─────┐  │     │
            │promoted│ │expired │  │     │
            │→ incident│ │(suppressed)│  │     │
            └────┬───┘ └────────┘  │     │
                 │                  │     │
                 └──────────────────┴─────┘
                            │
                    ┌───────▼───────┐
                    │  incident     │
                    │  open         │
                    └───────┬───────┘
                            │ operator triages
                    ┌───────▼───────┐
                    │  investigating │
                    └───────┬───────┘
                            │ blast-radius + plan generated
                    ┌───────▼───────┐
                    │  recovering    │
                    └───────┬───────┘
                            │ execution + validation
                    ┌───────▼───────┐
                    │  validating    │
                    └───────┬───────┘
                            │
                  ┌─────────┼──────────┐
                  │         │          │
           ┌──────▼──┐ ┌───▼───┐ ┌───▼────┐
           │restored │ │partial│ │closed  │
           │(trusted)│ │       │ │(no action)│
           └─────────┘ └───────┘ └────────┘
```

### Transition Triggers

| Transition | Trigger |
|-----------|---------|
| Bundle → Suppressed | Score < 30, or self-action, or excluded identity |
| Bundle → Candidate | Score 50-79 |
| Bundle → Incident (immediate) | Score >= 80 |
| Candidate → Incident (promoted) | New evidence raises score >= 80, or correlation window expires with score still >= 60 |
| Candidate → Suppressed | Correlation window expires with score < 60, or evidence weakens |
| Incident → Investigating | Operator opens the incident, or blast-radius analysis begins |
| Investigating → Recovering | Recovery plan generated and approved |
| Recovering → Validating | Recovery execution complete |
| Validating → Restored | All validation checks pass |
| Validating → Partial | Some checks fail or remain unresolved |
| Any open state → Closed (no action) | Operator determines incident is a false positive or does not require recovery |

---

## 11. Immediate vs Deferred Incident Creation

### Immediate Incident Creation

| Condition | Example |
|-----------|---------|
| High-sensitivity group membership modified by non-human actor | Agent adds 12 users to Finance-Privileged-Access |
| Directory role assignment modified by non-human actor | App grants Global Admin role |
| CA policy targeting modified | Agent changes MFA-Bypass policy group assignment |
| CA policy created or deleted | New CA policy created by automation |
| Service principal credential added to privileged app | New client secret added to SAP Finance SP |

**Immediate incidents bypass the candidate stage.** They are created as open incidents and immediately trigger blast-radius analysis.

### Deferred (Candidate) Creation

| Condition | Example | Promotion Criteria |
|-----------|---------|-------------------|
| Medium-sensitivity group change by non-human actor | Agent modifies a departmental group | Promote if baseline conflict detected, or if blast-radius pre-check reveals downstream impact |
| App role assignment change to medium-sensitivity app | New role added for a line-of-business app | Promote if the app is on the sensitivity list or if bulk assignments detected |
| Bulk user attribute changes | Agent modifies 50 user department attributes | Promote if the changes affect group dynamic membership rules for sensitive groups |
| Single high-sensitivity change with low telemetry confidence | Snapshot diff shows CA policy change but no audit event yet | Promote when audit event arrives confirming the change |

### Candidate Correlation Window

Default: 30 minutes. During this window:
- New evidence (audit events, webhook notifications, snapshot diffs) is matched against open candidates
- If new evidence strengthens the candidate's score, it may be promoted
- If the window expires with score >= 60, the candidate is promoted (erring on the side of visibility)
- If the window expires with score < 60, the candidate is suppressed

---

## 12. Severity, Urgency, and Confidence Model

### Three Separate Dimensions

| Dimension | Question It Answers | Scale | Can Change Over Time |
|-----------|-------------------|-------|---------------------|
| **Severity** | How bad is this if we do not recover? | Critical / High / Medium / Low | Yes (blast-radius analysis may upgrade severity) |
| **Urgency** | How quickly must the operator act? | Immediate / Within-hour / Within-day / Informational | Yes (active access expansion upgrades urgency) |
| **Confidence** | How sure are we that this is a real incident? | High / Medium / Low | Yes (late evidence can increase or decrease) |

### Why Separate

A change can be:
- **High severity, low confidence:** A CA policy change detected only by snapshot diff with no audit event. If real, it is critical. But we are not sure it happened.
- **Low severity, high confidence:** A confirmed membership change to a non-sensitive group. Definitely happened, but low impact.
- **High severity, high confidence, low urgency:** A privileged group change detected from a change that already occurred 12 hours ago (M365 delayed telemetry). Impact is high and confirmed, but the window for immediate response has passed.

Collapsing these into one score would make all three cases look the same to the operator.

### Downstream Effects

| Dimension | Effect on Operator UI | Effect on Blast-Radius | Effect on Recovery |
|-----------|---------------------|----------------------|-------------------|
| Severity | Sort order in incident list; color badge | Triggers broader or narrower graph traversal | Determines whether approval is per-step or per-tier |
| Urgency | Notification priority; flashing/persistent alert | Triggers immediate vs scheduled analysis | Determines whether deferred re-validation is acceptable |
| Confidence | Indicator badge; "Investigate" vs "Possible" language | Affects confidence tagging of impacted objects | Low confidence → planner requires operator confirmation before recommending execution |

---

## 13. Noise Suppression and Deduplication

### Suppression Rules

| Rule | Trigger | Behavior |
|------|---------|----------|
| **Self-action** | `selfAction: true` on normalized change | Suppress. Log with suppression reason. |
| **Excluded identity** | Actor is on the tenant's exclusion list | Suppress. Log with suppression reason. |
| **Low-impact change type** | Property modification to non-access-relevant fields (displayName, description, phone) | Suppress. Not logged unless debug mode. |
| **Below threshold** | Ingestion preliminary score < 30 AND no sensitivity-list match | Suppress. Log in raw event store only. |
| **Duplicate candidate** | New bundle matches an existing open candidate (same target, same actor, overlapping time) | Merge into existing candidate. Do not create a new one. |
| **Duplicate incident** | New bundle matches an existing open incident (same root object, same change type, within 1 hour) | Add as correlated evidence to existing incident. Do not create new incident. |

### What Operators See

- **Suppressed events:** Not visible in the incident list. Visible in the audit trail if explicitly searched.
- **Candidates:** Not visible in the default incident list. Visible in a "Candidates" filter or sub-view.
- **Incidents:** Visible in the default incident list.
- **Merged incidents:** The surviving incident shows a "merged from" note linking to the superseded candidate(s).

### Suppression Auditability

Every suppression decision is logged with:
- The change bundle that was suppressed
- The specific suppression rule that triggered
- The score at the time of suppression
- Timestamp

This allows security review of what was suppressed. An operator with Tenant Admin role can review suppressed events.

---

## 14. Late Evidence and Incident Evolution

### How Incidents Evolve

| Event | Effect |
|-------|--------|
| **New audit event arrives for same change** | Correlated to existing incident. May upgrade confidence (e.g., from medium to high if before/after state now available). |
| **M365 audit event arrives hours later** | Added as correlated evidence. May add new impacted objects to blast radius. May upgrade severity if M365 impact is broader than initially assessed. |
| **Blast-radius analysis completes** | Severity may be upgraded if downstream impact is broader than the initial signal suggested. |
| **Baseline comparison reveals conflict** | Severity may be upgraded if the change moves the environment further from approved baseline than the initial assessment indicated. |
| **Conflicting evidence arrives** | Confidence may be downgraded. Operator is notified that the incident classification is less certain. |
| **Operator dismisses as false positive** | Incident is closed with "no action" status and false-positive flag. Used for tuning thresholds. |

### Late Promotion of Suppressed Candidates

A suppressed candidate can be re-evaluated if:
- A new high-confidence audit event arrives that matches the suppressed bundle
- A blast-radius pre-check on a related incident discovers the suppressed object as downstream impact
- The operator explicitly searches for and promotes the suppressed candidate

Re-evaluation applies the same scoring logic with the new evidence. If the score now exceeds the threshold, the candidate is promoted to an incident.

---

## 15. Downstream Handoff

### What the Incident Layer Provides to Blast-Radius and Recovery

```
IncidentHandoff
  ├── incidentId: string
  ├── tenantId: string
  ├── rootChanges: NormalizedChange[]       // the triggering change(s)
  ├── correlatedChanges: NormalizedChange[] // related changes in the bundle
  ├── severity: SeverityLevel
  ├── urgency: UrgencyLevel
  ├── confidence: ConfidenceLevel
  ├── classificationRationale: string[]     // why this is an incident
  ├── sensitivityContext: {
  │     targetSensitivity: "high" | "medium" | "low",
  │     actorClassification: "known-agent" | "non-human" | "human" | "unknown",
  │     sensitivityListMatches: string[]
  │   }
  ├── immediateOrPromoted: "immediate" | "promoted-from-candidate"
  ├── promotionEvidence: string[] | null     // what evidence caused promotion
  └── mergeHistory: string[] | null          // IDs of merged candidates
```

### When Blast-Radius Analysis Is Triggered

| Incident Type | Blast-Radius Trigger |
|---------------|---------------------|
| Immediate incident | Triggered immediately upon incident creation |
| Promoted candidate (high confidence) | Triggered immediately upon promotion |
| Promoted candidate (medium confidence) | Triggered after operator opens the incident (on-demand) |
| Low-confidence incident | Not auto-triggered; operator can request manually |

---

## 16. API and Data Model

### Core Entities

```
Incident
  ├── incidentId: string
  ├── tenantId: string
  ├── title: string                          // generated from root change description
  ├── severity: "critical" | "high" | "medium" | "low"
  ├── urgency: "immediate" | "within-hour" | "within-day" | "informational"
  ├── confidence: "high" | "medium" | "low"
  ├── status: IncidentStatus                 // state machine from section 10
  ├── rootChangeIds: string[]
  ├── correlatedChangeIds: string[]
  ├── classificationRationale: ClassificationRationale
  ├── sensitivityContext: SensitivityContext
  ├── detectedAt: timestamp
  ├── createdAt: timestamp
  ├── creationType: "immediate" | "promoted"
  ├── promotedAt: timestamp | null
  ├── mergedFrom: string[] | null
  ├── severityHistory: { severity, changedAt, reason }[]
  ├── blastRadiusTriggered: boolean
  ├── recoveryPlanId: string | null
  └── closedAt: timestamp | null

IncidentCandidate
  ├── candidateId: string
  ├── tenantId: string
  ├── bundleId: string                       // from correlated change bundle
  ├── score: number
  ├── signals: DetectionSignal[]
  ├── status: "open" | "promoted" | "suppressed" | "expired"
  ├── createdAt: timestamp
  ├── correlationWindowExpiresAt: timestamp
  ├── promotedToIncidentId: string | null
  └── suppressionReason: string | null

DetectionSignal
  ├── signalType: string                     // e.g., "actor-non-human", "target-high-sensitivity"
  ├── value: string | number | boolean
  ├── weight: number
  └── source: string                         // which data source contributed this signal

ClassificationRationale
  ├── signals: DetectionSignal[]
  ├── scoreAtCreation: number
  ├── scoreAtPromotion: number | null
  ├── immediateCreationCriteria: string[] | null
  ├── promotionEvidence: string[] | null
  └── narrative: string                       // human-readable summary

SuppressionRecord
  ├── suppressionId: string
  ├── bundleId: string
  ├── rule: string
  ├── score: number
  ├── suppressedAt: timestamp
  └── reason: string
```

---

## 17. Explainability and Operator-Facing Rationale

### What the Operator Sees

When viewing an incident, the operator should see:

**Classification section:**
> **Why this is an incident:**
> - Target "Finance-Privileged-Access" is on the high-sensitivity groups list
> - Actor "Access Lifecycle Agent" is a non-human identity on the known-agent list
> - 12 members were added in a single workflow session (bulk magnitude)
> - Change type is group membership modification (access-expanding)
>
> **Confidence: High**
> - Confirmed by Entra audit log with before/after state
> - Corroborated by Graph webhook notification
>
> **Severity: High**
> - Privileged group membership change affecting 5 downstream system categories
>
> **Urgency: Immediate**
> - Active access expansion confirmed; 12 users now have elevated privileges

### What the Operator Can Do

- **Acknowledge:** Accept the classification and proceed to investigation
- **Reclassify:** Manually adjust severity if the system's assessment is wrong
- **Dismiss:** Mark as false positive (requires a reason; used for tuning)
- **Merge:** Merge with another related incident

---

## 18. Security and Safety Considerations

### Self-Action Exclusion

Self-action exclusion is the first check in the classification pipeline. It runs before scoring, not after. A self-action change never reaches the scoring logic.

### Abuse Prevention

If an attacker gains control of a non-KavachIQ service principal and makes high-impact changes, the incident system should detect them. The exclusion list only contains KavachIQ's own SP-Execute and explicitly configured known-safe identities. Unknown service principals making privileged changes are not excluded.

### Classification Audit

Every classification decision (incident creation, candidate creation, suppression, promotion, merge, dismissal) is logged in the immutable audit trail with full signal detail and the score at the time of decision.

---

## 19. Operational Constraints

### Latency Targets

| Phase | Target |
|-------|--------|
| Correlated bundle → classification decision | < 5 seconds |
| Immediate incident → blast-radius trigger | < 10 seconds after incident creation |
| Candidate correlation window | 30 minutes (configurable: 15-60 min) |
| Late-evidence re-evaluation | < 30 seconds after new evidence ingested |

### Tuning Burden

Sensitivity lists are the primary tuning mechanism. Scoring weights are set by the product and should not require per-tenant adjustment in v1. If a tenant experiences too many false positives, the fix is to adjust their sensitivity lists (remove over-sensitive groups) or exclusion lists (add known-safe automation identities), not to adjust scoring weights.

### Storage

Incident candidates (including suppressed) are retained for 30 days for audit review. Active incidents follow the standard retention policy (1 year default). Suppressed events consume minimal storage (metadata only; raw events already stored by ingestion).

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Too many noisy incidents | Operators ignore the product; alert fatigue | High | Two-stage detection; candidate buffer; tenant-specific sensitivity lists; false-positive tracking for tuning |
| Critical incident suppressed | High-impact change goes unrecovered | Critical | Default sensitivity thresholds err toward detection; suppressed candidates can be re-evaluated on new evidence; audit trail of suppression decisions |
| One logical incident split into many | Operator sees 5 incidents for 1 event; confusion and duplicated effort | Medium | Ingestion-level correlation; incident-layer dedup on target+actor+timewindow; merge capability |
| Unrelated changes merged | Merge produces a confusing super-incident with wrong blast radius | Medium | Merge criteria are strict (same target object, same actor, overlapping time); operator can split merged incidents |
| Severity assigned too low | Operator deprioritizes a critical incident | High | Blast-radius analysis can upgrade severity post-creation; baseline conflict check adds severity signal |
| Confidence overstated | Operator trusts a low-quality classification | Medium | Confidence is derived from telemetry quality, not just signal strength; low-confidence incidents shown with explicit uncertainty language |
| M365 late evidence changes meaning | Incident was triaged as medium severity; 4 hours later M365 audit reveals broad SharePoint impact | Medium | Late-evidence re-evaluation upgrades severity; operator notified of incident evolution |
| Self-action exclusion failure | KavachIQ's own writes flagged as incidents; feedback loop | High | Self-action check is the first pipeline step; runs before scoring; uses SP-Execute appId match |
| Scoring weights produce unexpected results | A legitimate change combination accidentally scores as critical | Medium | Scoring weights are product-set, not ML-derived; weight ranges are bounded; false-positive tracking enables weight refinement |

---

## 21. Open Questions

1. **Should the operator be able to manually create incidents?** If an operator learns about a high-impact change through an external channel (vendor notification, support ticket), should they be able to manually inject an incident into KavachIQ? This would require defining "manual incident" as a detection source.

2. **What is the right default sensitivity list for new tenants?** Should the system auto-detect privileged groups (Global Admin group, etc.) or require the tenant admin to configure sensitivity lists from scratch during onboarding?

3. **Should the correlation window be adaptive?** A fixed 30-minute window catches most burst operations but may miss slow-rolling agent workflows. Should the window extend dynamically if evidence keeps arriving?

4. **How should the system handle changes to the sensitivity list itself?** If an operator adds a group to the high-sensitivity list, should the system retroactively re-evaluate recent changes to that group?

5. **Should the system support "watch mode" for medium-sensitivity objects?** Instead of creating incidents, monitor specific objects and alert only when a change pattern matches predefined criteria. This would reduce noise for objects that are important but frequently modified legitimately.

6. **How should false-positive tracking feed into threshold tuning?** If 80% of incidents for a specific change type are dismissed as false positives, should the system suggest raising the threshold for that type? Manual tuning vs semi-automated suggestion is a product decision.

7. **Should the incident system support external signal ingestion?** Could SIEM alerts or third-party notifications serve as additional scoring signals? This would strengthen detection but adds integration surface.

---

## 22. Recommendation Summary

### Build for v1

- **Two-stage detection pipeline:** Immediate incident creation for clearly high-impact changes; candidate stage for ambiguous signals with 30-minute correlation window
- **Rule-based scoring with tenant-specific sensitivity lists:** Scoring uses 12+ signal dimensions; sensitivity lists are the primary tuning mechanism; no ML
- **Separate severity, urgency, and confidence:** Three independent dimensions, not one score
- **Self-action exclusion as the first pipeline step:** Before scoring, not after
- **Noise suppression with audit trail:** Suppressed events are logged with full rationale; auditable by tenant admin
- **Late-evidence re-evaluation:** Existing incidents and candidates can be upgraded when new telemetry arrives
- **Operator-facing classification rationale:** Every incident shows why it was classified, what signals were used, and what confidence level applies

### Defer to v2+

- ML-based anomaly detection (behavioral baselines, statistical outlier detection)
- Adaptive correlation windows
- External signal ingestion (SIEM alerts, threat intelligence feeds)
- Auto-tuning of scoring weights based on false-positive feedback
- Semi-automated sensitivity list suggestions (auto-detect privileged groups)
- Manual incident creation by operators
- "Watch mode" for medium-sensitivity objects

### Assumptions That Must Hold

1. Entra audit logs provide the primary detection signal for identity changes. If audit log latency or completeness degrades significantly, detection quality drops.
2. Tenant admins will configure sensitivity lists during onboarding. Without configured lists, the system cannot distinguish privileged from non-privileged objects.
3. The 30-minute correlation window is sufficient for most agent-driven burst operations. Slow-rolling workflows that span hours will be detected as separate incidents (acceptable for v1).
4. False-positive rates below 20% are achievable with well-configured sensitivity lists. Above 20%, operator trust erodes.

### Prototype/Validate Next

1. **False-positive rate measurement.** Replay 7 days of Entra audit logs from a real mid-size tenant through the scoring pipeline with a representative sensitivity list. Measure: incidents created, candidates created, suppressed events, and (via manual review) estimated false-positive rate.
2. **Sensitivity list bootstrapping.** Develop a proposed auto-detection heuristic for identifying likely-privileged groups in a new tenant (groups with directory role assignments, groups used in CA policy targeting, groups with < 20 members and broad app access). Validate against 3-5 real tenants.
3. **Correlation window calibration.** Analyze timing patterns of known agent-driven workflows across 3-5 tenants. Measure whether the 30-minute default window correctly groups related changes without over-grouping unrelated ones. Identify whether 15 minutes or 60 minutes would be better for specific tenant profiles.
