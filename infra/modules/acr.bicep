// Azure Container Registry — for pipeline-worker / polling-worker / API images.
// Basic tier ~$5/mo; sufficient for v1 single-region deployment.
//
// Week 5: admin credentials removed. Image pulls use the shared UAMI
// (managed-identity.bicep) with AcrPull granted here.

@description('ACR name. Globally unique, 5-50 chars, alphanumeric only (no dashes).')
@minLength(5)
@maxLength(50)
param name string

@description('Region.')
param location string

@description('Principal ID of the shared user-assigned managed identity. Granted AcrPull here.')
param uamiPrincipalId string

// AcrPull built-in role ID (constant across all subscriptions/tenants)
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acr 'Microsoft.ContainerRegistry/registries@2024-11-01-preview' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false  // admin creds disabled; UAMI handles all pulls
    publicNetworkAccess: 'Enabled'
  }
}

// Grant AcrPull to the UAMI. Created in the same deployment as the UAMI
// (which precedes the Container Apps), so RBAC propagates before the first
// image pull attempt.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uamiPrincipalId, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output id string = acr.id
output name string = acr.name
output loginServer string = acr.properties.loginServer
