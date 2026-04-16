# Canonical Scenario Fixtures

These JSON fixture files are derived from real Microsoft audit events observed during the Phase 0 audit log spike (WI-05).

The **scenario definition** is fixed in `docs/CANONICAL_SCENARIO_FIXTURE.md`. These files are implementation artifacts that conform to that definition.

## Files

| File | Content | Status |
|------|---------|--------|
| `raw-events.json` | 12 raw Entra audit events from the canonical scenario | TODO: populate from spike results |
| `normalized-changes.json` | 12 NormalizedChange records | TODO: populate from spike results |
| `correlated-bundle.json` | 1 CorrelatedChangeBundle | TODO: populate from spike results |
| `incident.json` | 1 Incident (expected output) | TODO: populate from spike results |
| `blast-radius.json` | 1 BlastRadiusResult (structural placeholder) | TODO: populate in Phase 2 |
| `recovery-plan.json` | 1 RecoveryPlan (structural placeholder) | TODO: populate in Phase 3 |

## Usage

These fixtures are used by:
- Unit tests (validate normalization pipeline output)
- Integration tests (replay through full pipeline)
- Phase 1 admin CLI (inspect fixture data)
