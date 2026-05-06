// Storage Account for Blob:
//   raw-events  — N10 immutable source of truth (raw audit JSON archive)
//   baselines   — large baseline state JSONs (group-membership, app-role)
// D3 + N10.

@description('Storage account name. Globally unique. 3-24 lowercase alnum, no dashes.')
@minLength(3)
@maxLength(24)
param accountName string

@description('Region.')
param location string

resource st 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: accountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    accessTier: 'Hot'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource blob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: st
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    isVersioningEnabled: false
    changeFeed: {
      enabled: false
    }
  }
}

resource rawEvents 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: 'raw-events'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'N10 immutable source of truth — Microsoft Graph audit JSON'
    }
  }
}

resource baselines 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: 'baselines'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'Per-tenant baseline snapshots — group-membership, app-role-assignment'
    }
  }
}

// Lifecycle management — hot 30d → cool 90d → archive indefinitely.
resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: st
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'rawEventsTiering'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['raw-events/']
            }
            actions: {
              baseBlob: {
                tierToCool: { daysAfterModificationGreaterThan: 30 }
                tierToArchive: { daysAfterModificationGreaterThan: 90 }
              }
            }
          }
        }
      ]
    }
  }
}

output accountName string = st.name
output blobEndpoint string = st.properties.primaryEndpoints.blob
