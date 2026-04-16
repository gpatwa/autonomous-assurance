# Infrastructure

Azure deployment templates (Bicep/ARM) for the KavachIQ platform.

## Planned templates

| Template | Purpose | Phase |
|----------|---------|-------|
| `tenant-provision.bicep` | Per-tenant Storage Account + Key Vault + encryption key | Phase 5 |
| `platform-core.bicep` | Shared control plane: Container Apps, Cosmos DB, Service Bus | Phase 1-2 |
| `execution-service.bicep` | Separate execution Container App | Phase 4 |

Infrastructure templates will be created as deployment needs arise.
Phase 0-1 uses local dev (Docker Compose + Azurite) and manual Azure setup for spikes.
