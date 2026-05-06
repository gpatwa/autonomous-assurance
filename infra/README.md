# Infrastructure as Code (Bicep)

Multi-tenant platform infrastructure for KavachIQ. Defined per
`docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md` (APPROVED 2026-05-05).

## Layout

```
infra/
├── main.bicep                    Orchestrator — deploys everything
├── main.parameters.dev.json      Per-env parameter values (dev shown)
├── modules/
│   ├── app-insights.bicep        Log Analytics + Application Insights
│   ├── key-vault.bicep           Per-tenant DEK storage + secrets
│   ├── storage.bicep             Blob containers: raw-events, baselines
│   ├── service-bus.bicep         Standard tier, sessions enabled
│   ├── postgres.bicep            Flexible Server with RLS-ready config
│   └── container-apps-env.bicep  Managed env for workers + API
└── README.md                     This file
```

## Deploy (one-time, dev)

```bash
# 1. Create the resource group (one-time)
az group create -n rg-kavachiq-platform -l centralus

# 2. Generate a strong Postgres admin password
PG_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-30)

# 3. Deploy
az deployment group create \
  --resource-group rg-kavachiq-platform \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.dev.json \
  --parameters postgresAdminPassword="$PG_PASSWORD" \
  --query "properties.outputs"

# 4. Store password in Key Vault for future deploys
KV_NAME=$(az deployment group show -g rg-kavachiq-platform -n main \
  --query "properties.outputs.keyVaultName.value" -o tsv)
az keyvault secret set --vault-name "$KV_NAME" \
  --name postgres-admin-password --value "$PG_PASSWORD"

# 5. Apply schema migration
PG_FQDN=$(az deployment group show -g rg-kavachiq-platform -n main \
  --query "properties.outputs.postgresFqdn.value" -o tsv)
PGPASSWORD="$PG_PASSWORD" psql \
  -h "$PG_FQDN" -U kavachiqadmin -d kavachiq \
  -f platform/packages/storage/migrations/0001_initial.sql
```

## Subsequent deploys

Re-run step 3 with the password retrieved from Key Vault:

```bash
PG_PASSWORD=$(az keyvault secret show --vault-name "$KV_NAME" \
  --name postgres-admin-password --query value -o tsv)
az deployment group create \
  --resource-group rg-kavachiq-platform \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.dev.json \
  --parameters postgresAdminPassword="$PG_PASSWORD"
```

Bicep is idempotent — re-running against existing resources only changes drifted properties.

## Cost (recurring, dev tier)

| Resource | SKU | ~Monthly |
|---|---|---|
| Postgres Flex | B1ms | $13 |
| Service Bus | Standard | $10 |
| Key Vault | Standard | $2 |
| Storage Account | Standard LRS | $1-5 |
| Container Apps env | (no apps yet) | $0 |
| Log Analytics + App Insights | Free tier | $0 |
| **Total** | | **~$26-30/mo** |

Container Apps + workloads add cost only when deployed. Estimates per `docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md §8`.

## Multi-environment

Each environment gets its own RG and parameters file:

- `rg-kavachiq-platform` + `main.parameters.dev.json` — current
- `rg-kavachiq-platform-prod` + `main.parameters.prod.json` — when shipping prod
- `rg-kavachiq-platform-eu` + `main.parameters.eu.json` — D6 multi-region

Same `main.bicep`, different parameters file. Resource names parameterized by environment.

## Subsequent revisions

Schema-affecting changes require a new migration in
`platform/packages/storage/migrations/000N_*.sql`. Apply via the
same `psql -f` pattern. Migration naming + ordering is enforced by
the storage package's runner (see `platform/packages/storage/`).
