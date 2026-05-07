// KavachIQ multi-tenant platform — main Bicep orchestrator.
// Approved 2026-05-05 per docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md.
//
// Deploys, in dependency order:
//   1. App Insights + Log Analytics (observability backend, D7)
//   2. Key Vault                    (per-tenant DEK + secrets, D2)
//   3. Storage Account              (Blob raw-events + baselines, D3, N10)
//   4. Service Bus namespace        (queues with sessions, D4, N7)
//   5. Container Apps environment   (workers + API runtime, D4, N8)
//   6. Postgres Flexible Server     (state + RLS, D2, D3)
//   7. User-assigned managed identity + ACR (credential-free image pull, Week 5)
//
// Idempotent. Re-runs only update drifted properties.

targetScope = 'resourceGroup'

// ─── Parameters ──────────────────────────────────────────────────────────

@description('Region — must match the resource group region.')
param location string = resourceGroup().location

@description('Environment short name — e.g. dev, staging, prod.')
@allowed(['dev', 'staging', 'prod', 'eu'])
param env string = 'dev'

@description('Resource name prefix.')
param namePrefix string = 'kavachiq-platform'

@description('Postgres administrator login. Cannot be: azure_superuser, azure_pg_admin, admin, administrator, root, guest, public.')
param postgresAdminLogin string = 'kavachiqadmin'

@description('Postgres administrator password. Generate with openssl rand -base64 32.')
@secure()
@minLength(16)
param postgresAdminPassword string

@description('Object IDs of users/groups to grant Key Vault Secrets Officer (read+write secrets) at the RBAC level.')
param keyVaultAdmins array = []

@description('pipeline-worker container image (full ref incl. registry+tag). Empty = skip Container App deploy.')
param pipelineWorkerImage string = ''

@description('Service Bus namespace primary connection string for the pipeline-worker. Required if pipelineWorkerImage is set.')
@secure()
param pipelineWorkerServiceBusConnection string = ''

@description('Postgres URL with sslmode=require. Required if pipelineWorkerImage is set.')
@secure()
param pipelineWorkerDatabaseUrl string = ''

@description('polling-worker container image (full ref incl. registry+tag). Empty = skip Container App deploy.')
param pollingWorkerImage string = ''

@description('Service Bus namespace primary connection string for the polling-worker. Required if pollingWorkerImage is set.')
@secure()
param pollingWorkerServiceBusConnection string = ''

@description('Postgres URL with sslmode=require for the polling-worker. Required if pollingWorkerImage is set.')
@secure()
param pollingWorkerDatabaseUrl string = ''

@description('Storage Account connection string for polling-worker Blob writes. Required if pollingWorkerImage is set.')
@secure()
param pollingWorkerStorageConnectionString string = ''

// ─── Computed names ──────────────────────────────────────────────────────
// Globally unique resource names for storage + KV + SB + Postgres.
// If a name collision occurs, override via parameters file.

var suffix = '-${env}'
var keyVaultName       = 'kv-${namePrefix}${suffix}'
var serviceBusName     = 'sb-${namePrefix}${suffix}'
var postgresName       = 'pg-${namePrefix}${suffix}'
var containerEnvName   = 'cae-${namePrefix}${suffix}'
var appInsightsName    = 'appi-${namePrefix}${suffix}'
var logAnalyticsName   = 'log-${namePrefix}${suffix}'
// Storage account: 3-24 chars, lowercase alnum, no dashes
var storageAccountName = replace('${namePrefix}${env}st', '-', '')
// ACR: 5-50 chars, alphanumeric only (no dashes)
var acrName            = replace('${namePrefix}${env}acr', '-', '')
// UAMI shared by all Container Apps for ACR pull
var uamiName           = 'id-${namePrefix}${suffix}'

// ─── Modules ─────────────────────────────────────────────────────────────

module appInsights 'modules/app-insights.bicep' = {
  name: 'appInsights'
  params: {
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault'
  params: {
    name: keyVaultName
    location: location
    tenantId: subscription().tenantId
    adminPrincipalIds: keyVaultAdmins
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    accountName: storageAccountName
    location: location
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'serviceBus'
  params: {
    namespaceName: serviceBusName
    location: location
  }
}

module containerEnv 'modules/container-apps-env.bicep' = {
  name: 'containerEnv'
  params: {
    envName: containerEnvName
    location: location
    appInsightsConnectionString: appInsights.outputs.connectionString
    logAnalyticsCustomerId: appInsights.outputs.customerId
    logAnalyticsSharedKey: appInsights.outputs.sharedKey
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    serverName: postgresName
    location: location
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
  }
}

// UAMI created before ACR so the AcrPull role assignment can reference its
// principalId in the same deployment — no bootstrap deadlock.
module uami 'modules/managed-identity.bicep' = {
  name: 'uami'
  params: {
    name: uamiName
    location: location
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    name: acrName
    location: location
    uamiPrincipalId: uami.outputs.principalId
  }
}

module pipelineWorker 'modules/container-app-pipeline-worker.bicep' = if (!empty(pipelineWorkerImage)) {
  name: 'pipelineWorker'
  params: {
    name: 'ca-pipeline-worker${suffix}'
    location: location
    managedEnvironmentId: containerEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    uamiId: uami.outputs.id
    image: pipelineWorkerImage
    serviceBusConnectionString: pipelineWorkerServiceBusConnection
    databaseUrl: pipelineWorkerDatabaseUrl
    appInsightsConnectionString: appInsights.outputs.connectionString
    serviceBusNamespace: serviceBus.outputs.namespace
  }
}

module pollingWorker 'modules/container-app-polling-worker.bicep' = if (!empty(pollingWorkerImage)) {
  name: 'pollingWorker'
  params: {
    name: 'ca-polling-worker${suffix}'
    location: location
    managedEnvironmentId: containerEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    uamiId: uami.outputs.id
    image: pollingWorkerImage
    serviceBusConnectionString: pollingWorkerServiceBusConnection
    databaseUrl: pollingWorkerDatabaseUrl
    appInsightsConnectionString: appInsights.outputs.connectionString
    storageConnectionString: pollingWorkerStorageConnectionString
    serviceBusNamespace: serviceBus.outputs.namespace
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────

output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.uri
output storageAccountName string = storage.outputs.accountName
output blobEndpoint string = storage.outputs.blobEndpoint
output serviceBusNamespace string = serviceBus.outputs.namespace
output serviceBusEndpoint string = serviceBus.outputs.endpoint
output containerEnvName string = containerEnv.outputs.name
output containerEnvId string = containerEnv.outputs.id
output postgresName string = postgres.outputs.serverName
output postgresFqdn string = postgres.outputs.fqdn
output postgresAdminLogin string = postgresAdminLogin
output appInsightsName string = appInsights.outputs.name
output appInsightsConnectionString string = appInsights.outputs.connectionString
output acrName string = acr.outputs.name
output acrLoginServer string = acr.outputs.loginServer
output uamiName string = uami.outputs.id
output uamiClientId string = uami.outputs.clientId
