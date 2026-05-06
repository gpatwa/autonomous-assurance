// Container Apps managed environment.
// D4 + N8: hosts polling-worker, pipeline-worker, notification-worker, API.
// Workloads are deployed separately (week 2+); this module provisions only
// the environment so workloads can target it.

@description('Container Apps environment name.')
param envName string

@description('Region.')
param location string

@description('App Insights connection string for OTel export.')
param appInsightsConnectionString string

@description('Log Analytics workspace customer ID.')
param logAnalyticsCustomerId string

@description('Log Analytics shared key.')
@secure()
param logAnalyticsSharedKey string

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    daprAIConnectionString: appInsightsConnectionString
    zoneRedundant: false  // dev tier; enable in prod for HA
    workloadProfiles: [
      {
        // Consumption profile = pay-per-use, scale-to-zero capable.
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output id string = env.id
output name string = env.name
output defaultDomain string = env.properties.defaultDomain
output staticIp string = env.properties.staticIp
