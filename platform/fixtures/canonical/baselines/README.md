# Canonical Baseline Fixtures

Filesystem-backed baseline snapshots for the group-membership
pre-state reconstruction path. Consumed by
`createFilesystemSnapshotProvider` (see
`platform/packages/core/src/normalization/snapshot-provider.ts`).

## Layout

```
baselines/
└── {tenantId}/
    ├── group-memberships/
    │   └── {groupId}.json
    └── app-role-assignments/
        └── {servicePrincipalId}.json
```

Two kinds of baselines live here today — one per change class that
WI-05 showed to be snapshot-reconstructed:

- **group-memberships** (M1): who was a member of this group as of
  `capturedAt`?
- **app-role-assignments** (M3): which `(appRoleId, principalId)` pairs
  were assigned on this service principal as of `capturedAt`?

Per `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §7`, both classes'
audit events carry no usable `oldValue`; before-state must come from a
baseline snapshot. The M2 (Conditional Access) and M4 (SP credential)
classes are audit-authoritative on both sides and do not need a
baseline.

## File shapes

**group-memberships/{groupId}.json**

```json
{
  "tenantId": "...",
  "groupId": "...",
  "groupDisplayName": "...",
  "capturedAt": "<ISO-8601>",
  "memberUserIds": ["<userId>", ...]
}
```

**app-role-assignments/{servicePrincipalId}.json**

```json
{
  "tenantId": "...",
  "servicePrincipalId": "...",
  "servicePrincipalDisplayName": "...",
  "capturedAt": "<ISO-8601>",
  "assignments": [
    {
      "appRoleId": "<roleId>",
      "principalId": "<userId>",
      "principalType": "User"
    }
  ]
}
```

- `capturedAt` is an applicability gate: a query with `asOf < capturedAt`
  is rejected (`BaselineTooNewError`) — the baseline does not describe
  state at that earlier moment.
- For app-role-assignments, membership is checked by the exact
  `(appRoleId, principalId)` pair present in `assignments`.

## Current fixtures

| File | Purpose |
|------|---------|
| `3725cec5-…/group-memberships/45a4b187-c7c6-422a-b82b-48e199f63bb3.json` | Canonical M1 scenario's **Finance-Privileged-Access**. Empty member list — the 12 `kq-test-05..16` users are not prior members, matching the canonical scenario setup. |
| `3725cec5-…/group-memberships/00000000-0000-0000-0000-000000000099.json` | Synthetic **Pre-Member-Group**. Contains `kq-test-05`'s user ID as a prior member. Exercises the `isMember: true` branch (idempotent re-add). Not real audit evidence. |
| `3725cec5-…/app-role-assignments/cb9d0b62-9b5a-4614-8e0f-cb73f57f23b0.json` | Canonical M3 scenario's **KavachiqTest-App-01**. Empty assignments list — the SP was fresh when WI-05 captured the grant event, so no prior assignment exists. Matches real WI-05 tenant setup. |
| `3725cec5-…/app-role-assignments/00000000-0000-0000-0000-000000000098.json` | Synthetic **Pre-Assigned-App**. Contains a prior `(default-access role, kq-test-17)` assignment. Exercises the `isAssigned: true` branch (idempotent re-grant). Not real audit evidence. |

## Deferred

- History (multiple snapshots per group over time). Today each file is a
  single point-in-time snapshot.
- Missing-baseline soft-fallback with `confidence: "best-effort"` or
  `"unavailable"`. Today the provider throws; the caller decides how to
  degrade.
- Azure-Storage-backed provider. Today only the filesystem variant is
  implemented.
- Other change classes (conditional-access, app-role, SP-credential).
