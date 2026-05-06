// Key Vault for per-tenant DEK storage and platform secrets.
// D2: per-tenant DEK in envelope encryption.
// RBAC mode (not access policies) — modern best practice.

@description('Key Vault name. Globally unique. 3-24 chars, alphanumeric + dashes.')
@minLength(3)
@maxLength(24)
param name string

@description('Region.')
param location string

@description('AAD tenant ID for RBAC.')
param tenantId string

@description('Object IDs to grant Key Vault Secrets Officer (read+write secrets) at deploy time.')
param adminPrincipalIds array = []

resource kv 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: name
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled' // restrict via firewall in prod
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// Key Vault Secrets Officer role — read+write secrets
var secretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource adminRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in adminPrincipalIds: {
  scope: kv
  name: guid(kv.id, principalId, secretsOfficerRoleId)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsOfficerRoleId)
    principalType: 'User'
  }
}]

output id string = kv.id
output name string = kv.name
output uri string = kv.properties.vaultUri
