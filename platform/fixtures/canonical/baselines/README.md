# Canonical Baseline Fixtures

Filesystem-backed baseline snapshots for the group-membership
pre-state reconstruction path. Consumed by
`createFilesystemSnapshotProvider` (see
`platform/packages/core/src/normalization/snapshot-provider.ts`).

## Layout

```
baselines/
└── {tenantId}/
    └── group-memberships/
        └── {groupId}.json
```

One JSON file per (tenant, group). The file answers "who was a member
of this group as of `capturedAt`?". The snapshot provider uses this to
reconstruct `beforeState` for `memberAdded` events — WI-05 established
that group-membership audit events carry no `oldValue`, so before-state
must come from a baseline snapshot (see
`docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §7`).

## File shape

```json
{
  "tenantId": "...",
  "groupId": "...",
  "groupDisplayName": "...",
  "capturedAt": "<ISO-8601>",
  "memberUserIds": ["<userId>", ...]
}
```

- `capturedAt` is an applicability gate: a query with `asOf < capturedAt`
  is rejected (`BaselineTooNewError`) — the baseline does not describe
  state at that earlier moment.
- `memberUserIds` is the full member set at `capturedAt`. Membership is
  checked by exact userId match.

## Current fixtures

| File | Purpose |
|------|---------|
| `3725cec5-…/group-memberships/45a4b187-c7c6-422a-b82b-48e199f63bb3.json` | Canonical scenario's **Finance-Privileged-Access**. Empty member list — the 12 `kq-test-05..16` users are not prior members, matching the canonical scenario setup. |
| `3725cec5-…/group-memberships/00000000-0000-0000-0000-000000000099.json` | Synthetic **Pre-Member-Group**. Contains `kq-test-05`'s user ID as a prior member. Exercises the `isMember: true` branch (idempotent re-add path). Not generated from real audit evidence. |

## Deferred

- History (multiple snapshots per group over time). Today each file is a
  single point-in-time snapshot.
- Missing-baseline soft-fallback with `confidence: "best-effort"` or
  `"unavailable"`. Today the provider throws; the caller decides how to
  degrade.
- Azure-Storage-backed provider. Today only the filesystem variant is
  implemented.
- Other change classes (conditional-access, app-role, SP-credential).
