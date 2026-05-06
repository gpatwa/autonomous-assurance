// Azure Database for PostgreSQL Flexible Server.
// D2 + D3: state layer with RLS isolation.

@description('Server name. Globally unique. 3-63 chars, lowercase alnum + dashes.')
@minLength(3)
@maxLength(63)
param serverName string

@description('Region.')
param location string

@description('Admin login. Cannot be: azure_superuser, azure_pg_admin, admin, administrator, root, guest, public, sa.')
param adminLogin string

@description('Admin password. >= 16 chars, mixed case, digit, symbol.')
@secure()
@minLength(16)
param adminPassword string

@description('Compute SKU. Burstable B1ms = ~$13/mo.')
param skuName string = 'Standard_B1ms'

@description('Compute tier.')
@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param skuTier string = 'Burstable'

@description('Storage size in GB. Min 32 on Burstable.')
param storageSizeGB int = 32

@description('Postgres major version.')
@allowed(['16', '17'])
param postgresVersion string = '16'

@description('Initial database name created on the server.')
param databaseName string = 'kavachiq'

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7  // 35 in prod; 7 is fine for dev to save cost
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Allow other Azure services (Container Apps will hit this)
resource fwAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Initial database
resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allowlist Postgres extensions used by the schema (0001_initial.sql).
// Azure managed Postgres requires this server-level config before
// CREATE EXTENSION can succeed.
//   pgcrypto  — gen_random_uuid()
//   uuid-ossp — legacy uuid support
resource extensionsAllowlist 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: {
    value: 'PGCRYPTO,UUID-OSSP'
    source: 'user-override'
  }
}

output serverName string = pg.name
output fqdn string = pg.properties.fullyQualifiedDomainName
output databaseName string = db.name
