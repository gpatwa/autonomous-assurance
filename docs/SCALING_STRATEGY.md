# Scaling Strategy (TypeScript stack, 0 → 1,000+ tenants)

**Author:** Principal Engineer
**Date:** 2026-04-18
**Status:** Decision record. Not a design doc; does not define new architecture.
**Prerequisites:** `ENGINEERING_BOOTSTRAP_DECISIONS.md`, `ARCHITECTURE_MEMO.md`, `CONNECTOR_AND_INGESTION_DESIGN.md`, `DEPLOYMENT_AND_OPERATIONS_ARCHITECTURE.md`, `SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md`
**Classification:** Internal

---

## 1. Executive Summary

**Question:** Is the current stack (TypeScript on Node.js, Docker Compose for dev, Azure Container Apps + Cosmos DB + Azure Storage for prod) future-ready for 50–200 tenants now and 1,000+ later — or will KavachIQ need a language rewrite to Java/Kotlin/Scala (JVM) or Go?

**Answer:** Stay on TypeScript. No rewrite is required at any tenant count the business plan contemplates. The path to 1,000+ tenants is **architectural investment**, not a language change.

**Why.**

1. KavachIQ's workload is ≥ 90 % I/O-bound (audit polling, Graph API calls, DB reads/writes, queue drains). Node.js/V8 serves this class of workload at tens of thousands of requests per second per core — well before KavachIQ hits Microsoft Graph rate limits, Cosmos DB RU caps, or Azure egress quotas (the *actual* binding constraints).
2. The one CPU-bound component (blast-radius graph traversal) runs once per incident on bounded input (≤ 50–200 impacted objects). It is a rounding error of total cost.
3. Every serious scale ceiling is either (a) upstream-API-imposed (Graph quotas), (b) database-cost-imposed (Cosmos RUs), or (c) architectural (single-process state). None are language-speed-imposed.
4. The rewrite target people usually propose (JVM) is **worse** for KavachIQ's shape than Node.js on cost, cold start, and RAM floor. If a rewrite ever became necessary for one specific hot path, the right target is Go or Rust — not JVM.

**Cost of the rewrite people fear:** 9–18 months of ≈ zero product velocity, team attrition risk, schema duplication across languages, and loss of the `@kavachiq/schema` → API → UI type chain that is currently a first-class asset.

**Cost of the architectural investments this doc proposes instead:** roughly 8–10 engineering weeks spread across Phase 1, all of which produce value independent of the scaling question (durability, HA, observability, tenant isolation).

---

## 2. What KavachIQ's Workload Actually Is

Before judging the stack, be specific about the physics.

| Activity | Per-tenant cost | Shape |
|---|---|---|
| Audit-log polling | 1 request / 3–5 min ≈ 288–480/day | I/O-bound |
| Event normalization | ~1–10 ms CPU per event | CPU-light (JSON munging) |
| Correlation (hold window in memory) | Tens of KB per active window | Memory-bound if correlation state is in-process |
| Snapshot enumeration | Daily full + 4-hour critical = ~7/day | I/O-bound (Graph API calls) |
| Blast-radius traversal | ~50 impacted objects × 3-hop graph, **computed once per incident** | CPU-bound, bounded per incident |
| Recovery plan execution | ~1–20 Graph writes per incident | I/O-bound |
| Operator UI | HTTP request/response + pub/sub updates | I/O-bound |

**Arithmetic for 200 tenants:**

- Polls: 200 × 288 ≈ 60k/day ≈ 0.7/second average, peak ~10–20/second.
- Events normalized: even at a pessimistic 1,000 events/day/tenant = 200k/day ≈ 2.3/second sustained, burst perhaps 100–200/second during canonical-scenario-style agent bursts.
- These numbers do not stress a single Node.js core for JSON-shaped work.

**Arithmetic for 1,000 tenants:**

- Polls: ~3.3/second sustained.
- Events: ~12/second sustained, bursts in the low hundreds.
- Still well below the physical throughput of the stack. Dominated by Graph-quota and Cosmos-RU spend.

---

## 3. Real Scaling Bottlenecks

Every row below is a bottleneck that can bind before you run out of V8 throughput. The "language-change impact" column asks: would moving to JVM or Go materially help?

| Bottleneck | Binding limit | Language-change helps? |
|---|---|---|
| Microsoft Graph rate limits | ~10,000 req/10 min per app-per-tenant | **No.** Same wall regardless of stack. |
| Cosmos DB RU budget | Pay-per-RU; write amplification dominates | **No.** Same DB, same cost. |
| Azure ingress/egress quotas | Regional | **No.** |
| Correlation in-process memory | V8 heap ~4 GB per process | **Partial**, but the right fix is externalized state (Redis) regardless of language. |
| Autoscale cold start | Node ~200–500 ms; JVM ~2–5 s; Go ~50 ms; Rust ~20 ms | **JVM is worse**; Go/Rust slightly better. |
| Tail-latency GC pauses | V8 ~50–200 ms p99 on tuned heap | Similar on JVM (G1/ZGC); better on Go; none on Rust. |
| Single-threaded event loop | Cannot use multi-core from one process | **No.** Mitigation is "run N processes" — standard Node deployment; same pattern for Go/Python. |

The two rows where language choice has a real effect (cold start, GC tail) both **disfavor JVM**. Neither is a binding constraint at KavachIQ's SLA (audit ingestion is minute-scale; operator UI is second-scale — 200 ms tail pauses are invisible).

---

## 4. Landscape: What Comparable SaaS and Direct Competitors Actually Use

### Hyperscale products on Node.js / TypeScript

Scales far above anything KavachIQ will see in the business plan horizon:

| Company | Workload | Stack |
|---|---|---|
| Netflix | API gateway, tooling, studio-production platform | Node.js (migrated many services off Java) |
| PayPal | Customer-facing services | Node.js since 2013, migrated from Java |
| LinkedIn | Mobile backend | Node.js since 2012 |
| Slack | Real-time messaging backend | Node.js (+ Java for a few pieces) |
| Figma | Collaboration platform core | TypeScript (+ Rust/WASM for canvas hot path) |
| Vercel | Control plane serving millions of deployments | TypeScript / Node |
| Walmart | Black Friday checkout | Node.js |
| Auth0 (Okta) | Identity platform — thousands of enterprise tenants | Node.js |

None of these chose Java for scale. Several migrated off Java to Node.

### Direct competitors in identity security / SaaS posture management

| Company | Stack | Notes |
|---|---|---|
| Push Security | **TypeScript** | Same segment, proving TS viability |
| Lumos | **TypeScript** + Python | Same segment |
| Obsidian Security | Python + Go | |
| Abnormal Security | Python + Go (ML-heavy) | |
| SGNL | Go | Founder-stack bias |
| Opal Security | Go | Founder-stack bias |
| ConductorOne | Go | Founder-stack bias |
| Valence Security | Python | |
| Britive | Java + Go | |

TypeScript is **already present** in this exact competitive tier (Push, Lumos). Language has not been the competitive differentiator in identity security — product depth, detection quality, and customer trust have been.

"Everyone uses Go in identity-security" is a cultural artifact of founders from infra backgrounds, not an engineering necessity.

---

## 5. Where Node.js / TypeScript Could Hurt — Honest Enumeration

Specific failure modes and their mitigations. None require a language rewrite.

| Risk | Real impact | Mitigation |
|---|---|---|
| Event loop blocks on CPU-heavy computation | Blast-radius computation > 5 s blocks the process | Worker threads (native Node); or extract the one function to a Rust/Go sidecar. Figma's pattern. **Not a full rewrite.** |
| V8 heap fragmentation on long-running processes | Memory grows, needs recycling | Rolling-restart policy (standard Container Apps); bounded heap; externalize long-lived state |
| Runtime type erasure | Zod or similar adds overhead for runtime validation | Validate at ingress only, trust types after. Same boundary pattern as any language. |
| No true intra-process parallelism | Can't use multi-core from one process | Run N processes as replicas. Normal Node deployment. |
| npm supply-chain risk (real for a security product) | Transitive-dep vulnerabilities | Pinned versions, `npm audit` / Snyk / Socket.dev in CI, minimal transitive-dep surface |
| Tail-latency GC pauses | 50–200 ms p99 | Tune heap, minimize large allocations; SLA tolerance is seconds-to-minutes for this product |
| Memory cost per Container App replica | Node idle ~100 MB vs Go ~20 MB vs JVM ~2 GB | **Node is cheaper than JVM here**, only slightly more than Go |

---

## 6. Phased Scaling Plan — Zero Rewrites

### Phase 0 — now (1–5 tenants)

Current state. TypeScript. Single process is fine. In-memory correlation is fine. Ship.

### Phase 1 — first paying customers (≤ 50 tenants)

**Three architectural investments. No language change. All have value beyond scale.**

1. **Externalize correlation state to Redis** (~2–4 engineering weeks).
   - Removes the single-process assumption.
   - Enables HA failover.
   - Enables horizontal scale of workers.
2. **Queue-based fan-out between ingestion and normalization** (~1–2 weeks).
   - Azure Service Bus (or platform equivalent).
   - `tenantId` on every message as partition key.
   - Decouples throughput of the two stages.
   - Adds backpressure and retry semantics without code changes in the producers.
3. **Per-tenant shard key and routing policy** (~1 week).
   - Explicit policy even if every tenant maps to the same shard today.
   - Writing the *concept* of sharding in now makes multi-shard deployment a config change later.

Deployment: 2–3 Container App replicas for HA.

### Phase 2 — 50 → 200 tenants (target)

**Zero code changes if Phase 1 was done correctly.**

- Scale Container App replicas on queue depth.
- Cosmos DB moves from provisioned to autoscale RUs.
- Read replicas on Postgres (if it's introduced for operator-UI queries).
- Monitoring and alerting thresholds recalibrated.

At this tier, TypeScript is not the bottleneck. Graph API quotas, Cosmos RU pricing, and SLA monitoring fidelity bind first.

### Phase 3 — 200 → 500 tenants

**Still no rewrite.** Profile for real bottlenecks:

- If blast-radius computation p99 > 5 s → worker thread first; Rust/Go sidecar if insufficient.
- If snapshot-diff scan p99 > 30 s per tenant → parallelize; don't rewrite.
- Cosmos RU cost per tenant likely dominates the bill. Dollars, not latency.

### Phase 4 — 500 → 1,000+ tenants

Architectural maturity, not language:

- Regional sharding (EU tenants in EU region).
- Per-tenant data-plane isolation for regulated customers.
- Read-replica caching of policy / sensitivity lists.
- Streaming data path (Event Hub) alongside batch for the noisiest tenants.

At this scale, cost dominates architecture choice. Language-level CPU cost is a small fraction of the bill.

---

## 7. Metrics That Would Trigger Hot-Path Extraction (Not a Rewrite)

Do not let rumor drive engineering. The thresholds below would justify **extracting a single function** to a compiled language — not rewriting the system.

| Signal | Threshold | Response |
|---|---|---|
| Blast-radius computation p99 | > 5 s | Profile. Worker thread first. Rust/Go sidecar if still hot. Extract the one function. |
| Normalization p99 per event | > 100 ms | Profile. Almost always JSON overhead; optimize in place before considering language change. |
| V8 GC pause p99 | > 200 ms | Tune heap, reduce large allocations, move big state to Redis. |
| Correlation window memory per worker | > 500 MB for 50 tenants | Move windows to Redis. (Already planned for Phase 1.) |
| Queue backlog during normal load | Growing, not draining | Add replicas. Not a code problem. |
| Cosmos RU cost per tenant per month | > $X (set by finance) | Write-path optimization, read-through caching, materialized views. Not language-related. |

You are not near any of these today. You are not expected to be near any of them at 200 tenants.

---

## 8. What to Invest in Now to Buy the 1,000-Tenant Future

Concrete Phase 1 backlog, ordered by leverage:

1. **Redis for correlation state** — removes in-process assumption.
2. **Azure Service Bus between ingestion and normalization** — queue-partitioned by `tenantId`.
3. **Container App replica autoscale on queue depth** — config, not code.
4. **Explicit tenant routing / shard policy** — even trivial today, writes the concept in.
5. **Per-tenant Graph API rate-limit budget tracking** — prevents noisy-neighbor starvation.
6. **Load test at 10× current scale on real fixture-driven input** — benchmark each phase, not just when suspicious.

After these six, 1,000 tenants becomes "turn up the replicas and monitor cost." It is not a rewrite problem.

---

## 9. Decision Record: Why TypeScript Over JVM / Go / Rust

| Alternative | Would it help KavachIQ? |
|---|---|
| **JVM (Java / Kotlin / Scala)** | **No.** Worse cold start, ~20× RAM floor, JIT warm-up tail, same GC pauses, Graph SDK mature but less actively maintained than the TS one. The presumed "compile-to-speed" win does not exist for I/O-bound workloads. |
| **Go** | Marginally better cold start and memory density. Loses the shared-schema-with-UI story. Strong Graph SDK (`microsoftgraph-go`), strong concurrency primitives. Could be the right target for a single extracted hot path, not for the system. |
| **Rust** | Best performance and memory, no GC. Steepest learning curve. Right target for one specific CPU-bound hot path (e.g., graph traversal, diff computation). Wrong target for the whole system — ingestion-heavy async code in Rust is still unpleasant compared to TypeScript. |
| **Python** | Worse performance, same GC-pause concerns, split-brain on typing. Only justified for ML/AI components, which are not on KavachIQ's Phase 0–2 roadmap. |

**Why TypeScript is actively helping KavachIQ right now (not generic):**

1. `@kavachiq/schema` is one source of truth across ingestion / workers / execution / CLI / operator UI. Type-checking crosses every boundary. A rewrite to any other language forces JSON-schema + generated-DTOs-per-language duplication — a **regression**.
2. Operator UI is Next.js (already TS). API payloads flow type-checked into React components. No marshalling layer.
3. `@azure/identity` and `@microsoft/microsoft-graph-client` are production-grade and mature.
4. Canonical-scenario fixtures (`platform/fixtures/canonical/`) are consumed in the same language that produces them. Multi-language testing needs a serialization round-trip everywhere.
5. Talent market: full-stack TypeScript engineers are plentiful; full-stack TypeScript + Java engineers are not.

---

## 10. Where This Doc Is Weak / Provisional

Honest caveats:

1. **Real-world p99 numbers not measured yet.** The thresholds in §7 come from industry experience, not KavachIQ's own profiling. Phase 1 should include a sustained load test to establish actual baselines on this codebase on this infrastructure.
2. **Correlation-window memory cost scales with tenant count × active-window-size.** Externalizing to Redis is the declared plan but has its own operational cost; validate Redis pricing / throughput at 200 tenants.
3. **Cosmos DB RU cost model is not yet fully priced out.** This doc asserts RU cost dominates before language cost, but the actual crossover point is not measured.
4. **Blast-radius computation shape is partially known.** `BLAST_RADIUS_ENGINE_DESIGN.md` describes the algorithm; the constant factors have not been benchmarked on real tenants. The "runs once per incident, bounded input" assertion in §2 is design-level, not measured.

None of these caveats change the conclusion. They just flag that §8's Phase 1 investments should include measurement, not just implementation.

---

## 11. Recommendation Summary

- **Stay on TypeScript.** The stack is future-ready for 50–200 tenants today and reaches 1,000+ with architectural investment, not rewrite.
- **Make six specific Phase 1 investments** (§8) during the ≤ 50-tenant window, when there is still slack to do them without feature pressure.
- **Extract hot paths to Rust or Go if — and only if — profiling shows the thresholds in §7 are exceeded.** Do not rewrite the system.
- **Do not pursue JVM under any tenant count envisioned by the business plan.** It is strictly worse for this workload shape.
- **Measure before optimizing.** Include real-load baselining in Phase 1 alongside the architectural work.

The failure mode to avoid is not "TypeScript couldn't scale" — it is "we did not invest in horizontal-scale architecture before we needed it." The fix for that is architecture work, not language work.
