// Azure Container Registry — for pipeline-worker / polling-worker / API images.
// Basic tier ~$5/mo; sufficient for v1 single-region deployment.

@description('ACR name. Globally unique, 5-50 chars, alphanumeric only (no dashes).')
@minLength(5)
@maxLength(50)
param name string

@description('Region.')
param location string

resource acr 'Microsoft.ContainerRegistry/registries@2024-11-01-preview' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    // adminUserEnabled is true for v1 because the Container Apps + system-
    // assigned-identity bootstrap deadlocks: the first image-pull attempt
    // happens before the AcrPull role assignment propagates. Admin creds
    // are retrieved at deploy time via listCredentials() and stored as a
    // Container App secret. Managed identity is the longer-term answer
    // (track in week-4 hardening).
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
}

output id string = acr.id
output name string = acr.name
output loginServer string = acr.properties.loginServer
