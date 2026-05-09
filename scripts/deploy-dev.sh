#!/usr/bin/env bash
# scripts/deploy-dev.sh
#
# Build all platform images, push to ACR, and deploy the full stack to dev.
#
# Prerequisites:
#   - az login (with access to rg-kavachiq-platform)
#   - docker daemon running
#
# Usage:
#   bash scripts/deploy-dev.sh
#
# The script is idempotent: re-running updates changed resources only.
# Image tags are based on the git short SHA so each commit gets a unique tag.

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────

RG="rg-kavachiq-platform"
ACR="kavachiqplatformdevacr"
ACR_SERVER="${ACR}.azurecr.io"
KV="kv-kavachiq-platform-dev"
SB_NS="sb-kavachiq-platform-dev"
STORAGE_ACCOUNT="kavachiqplatformdevst"
PG_HOST="pg-kavachiq-platform-dev.postgres.database.azure.com"
PG_USER="kavachiqadmin"
PG_DB="kavachiq"
TAG=$(git rev-parse --short HEAD)

echo "=== KavachIQ dev deploy | tag: ${TAG} ==="

# ─── Build images ──────────────────────────────────────────────────────────

echo ""
echo "--- Building images (linux/amd64 for Azure Container Apps) ---"
docker build --platform linux/amd64 -t "${ACR_SERVER}/api:${TAG}"             -f platform/Dockerfile.api             platform/
docker build --platform linux/amd64 -t "${ACR_SERVER}/pipeline-worker:${TAG}" -f platform/Dockerfile.pipeline-worker platform/
docker build --platform linux/amd64 -t "${ACR_SERVER}/polling-worker:${TAG}"  -f platform/Dockerfile.polling-worker  platform/

# ─── Push to ACR ───────────────────────────────────────────────────────────

echo ""
echo "--- Pushing to ACR ---"
az acr login -n "$ACR"
docker push "${ACR_SERVER}/api:${TAG}"
docker push "${ACR_SERVER}/pipeline-worker:${TAG}"
docker push "${ACR_SERVER}/polling-worker:${TAG}"

# ─── Fetch secrets from Azure ──────────────────────────────────────────────

echo ""
echo "--- Fetching secrets ---"

PG_PASSWORD=$(az keyvault secret show \
  --vault-name "$KV" --name postgres-admin-password \
  --query value -o tsv)

DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}/${PG_DB}?sslmode=require"

SB_CONNECTION=$(az servicebus namespace authorization-rule keys list \
  -g "$RG" --namespace-name "$SB_NS" --name RootManageSharedAccessKey \
  --query primaryConnectionString -o tsv)

STORAGE_CONNECTION=$(az storage account show-connection-string \
  -g "$RG" --name "$STORAGE_ACCOUNT" \
  --query connectionString -o tsv)

# API key — stored in Key Vault for stability across deploys.
# On first deploy it won't exist yet; generate and store it.
if az keyvault secret show --vault-name "$KV" --name api-key &>/dev/null; then
  API_KEY=$(az keyvault secret show --vault-name "$KV" --name api-key --query value -o tsv)
  echo "  api-key: loaded from Key Vault"
else
  API_KEY=$(openssl rand -hex 32)
  az keyvault secret set --vault-name "$KV" --name api-key --value "$API_KEY" -o none
  echo "  api-key: generated and stored in Key Vault"
  echo ""
  echo "  !! Update KAVACHIQ_API_KEY in the console .env.local:"
  echo "     KAVACHIQ_API_KEY=${API_KEY}"
fi

# ─── Deploy ────────────────────────────────────────────────────────────────

echo ""
echo "--- Running Bicep deployment ---"

az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.dev.json \
  --parameters \
    postgresAdminPassword="$PG_PASSWORD" \
    apiImage="${ACR_SERVER}/api:${TAG}" \
    apiKey="$API_KEY" \
    apiDatabaseUrl="$DATABASE_URL" \
    pipelineWorkerImage="${ACR_SERVER}/pipeline-worker:${TAG}" \
    pipelineWorkerServiceBusConnection="$SB_CONNECTION" \
    pipelineWorkerDatabaseUrl="$DATABASE_URL" \
    pollingWorkerImage="${ACR_SERVER}/polling-worker:${TAG}" \
    pollingWorkerServiceBusConnection="$SB_CONNECTION" \
    pollingWorkerDatabaseUrl="$DATABASE_URL" \
    pollingWorkerStorageConnectionString="$STORAGE_CONNECTION" \
  --output table

# ─── Show API FQDN ─────────────────────────────────────────────────────────

echo ""
echo "--- Deployment complete ---"

API_FQDN=$(az containerapp show \
  -g "$RG" -n "ca-api-dev" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "(not deployed yet)")

echo "  API FQDN:  https://${API_FQDN}"
echo "  API key:   (stored in Key Vault as 'api-key')"
echo "  Image tag: ${TAG}"
echo ""
echo "  Update console KAVACHIQ_API_URL=https://${API_FQDN}"
