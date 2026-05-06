// Service Bus namespace + 3 queues.
// D4: queue-based orchestration.
// N7: session-keyed by tenant_id for per-tenant fairness.
// Standard tier required for sessions (Basic does not support them).

@description('Service Bus namespace name. Globally unique. 6-50 chars, alnum + dashes.')
@minLength(6)
@maxLength(50)
param namespaceName string

@description('Region.')
param location string

resource sb 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false // dev simplicity; prod should disable local auth and use managed identity
  }
}

// poll-tenant: cron-driven, one message per tenant per polling interval.
// session-keyed by tenant_id for FIFO + per-tenant fairness.
resource pollTenant 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: sb
  name: 'poll-tenant'
  properties: {
    requiresSession: true
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
    enableBatchedOperations: true
    lockDuration: 'PT5M'
    defaultMessageTimeToLive: 'P14D'
    maxSizeInMegabytes: 1024
  }
}

// process-events: emitted by polling worker after Blob archive.
// session-keyed by tenant_id for FIFO + per-tenant fairness (N7).
resource processEvents 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: sb
  name: 'process-events'
  properties: {
    requiresSession: true
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
    enableBatchedOperations: true
    lockDuration: 'PT5M'
    defaultMessageTimeToLive: 'P14D'
    maxSizeInMegabytes: 1024
  }
}

// notify-operator: fanout, no per-tenant FIFO needed; session not required.
resource notifyOperator 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: sb
  name: 'notify-operator'
  properties: {
    requiresSession: false
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
    enableBatchedOperations: true
    lockDuration: 'PT2M'
    defaultMessageTimeToLive: 'P7D'
    maxSizeInMegabytes: 1024
  }
}

output namespace string = sb.name
output endpoint string = sb.properties.serviceBusEndpoint
output id string = sb.id
