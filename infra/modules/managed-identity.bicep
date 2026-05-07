// User-assigned managed identity shared by all Container Apps.
//
// A single UAMI is created early in the deployment. The ACR module then
// grants AcrPull to this UAMI's principalId. Because the UAMI exists
// before any Container App is created, there is no bootstrap deadlock:
// the role assignment propagates during the rest of the deployment.
//
// Usage in main.bicep:
//   module uami 'modules/managed-identity.bicep' = { ... }
//   // pass uami.outputs.id   → Container App userAssignedIdentities key
//   // pass uami.outputs.principalId → acr module for AcrPull assignment

@description('Identity name.')
param name string

@description('Region.')
param location string

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
}

output id string = uami.id
output clientId string = uami.properties.clientId
output principalId string = uami.properties.principalId
