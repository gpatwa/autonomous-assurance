// Container App: polling-worker.
// D4 + N7 + N8 + N9: Service Bus session-keyed consumer for `poll-tenant`.
// Scales on poll-tenant queue length. System-assigned managed identity
// provisioned for future managed-identity ACR pull (week-4 hardening).
//
// Each replica accepts one session (one tenant) at a time, calls
// pollTenantBatch (Graph → Blob → raw_events → normalize → enqueue
// process-events), then releases the session.

@description('Container App name.')
param name string

@description('Region.')
param location string

@description('Container Apps managed environment ID.')
param managedEnvironmentId string

@description('ACR resource name (in the same RG) for admin credential lookup.')
param acrName string

@description('Container image (full reference incl. registry + tag).')
param image string

@description('Service Bus namespace primary connection string.')
@secure()
param serviceBusConnectionString string

@description('Postgres URL with sslmode=require.')
@secure()
param databaseUrl string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Storage Account connection string for Blob archive writes.')
@secure()
param storageConnectionString string

@description('Service Bus namespace name (for KEDA queue-length scaling).')
param serviceBusNamespace string

@description('CPU cores per replica.')
param cpu string = '0.25'

@description('Memory per replica.')
param memory string = '0.5Gi'

@description('Min replicas. 1 = always-on (KEDA scale-from-zero unreliable for session queues).')
param minReplicas int = 1

@description('Max replicas.')
param maxReplicas int = 10

resource acrRef 'Microsoft.ContainerRegistry/registries@2024-11-01-preview' existing = {
  name: acrName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'SystemAssigned'  // provisioned; unused for ACR pull until week-4 hardening
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        {
          name: 'service-bus-connection'
          value: serviceBusConnectionString
        }
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'app-insights-connection'
          value: appInsightsConnectionString
        }
        {
          name: 'storage-connection'
          value: storageConnectionString
        }
        {
          name: 'acr-admin-password'
          value: acrRef.listCredentials().passwords[0].value
        }
      ]
      registries: [
        {
          server: acrRef.properties.loginServer
          username: acrRef.listCredentials().username
          passwordSecretRef: 'acr-admin-password'
        }
      ]
      ingress: null  // worker — no external ingress
    }
    template: {
      containers: [
        {
          name: 'polling-worker'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'SERVICE_BUS_CONNECTION_STRING'
              secretRef: 'service-bus-connection'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'app-insights-connection'
            }
            {
              name: 'STORAGE_CONNECTION_STRING'
              secretRef: 'storage-connection'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'HEALTH_PORT'
              value: '8080'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health/live'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health/ready'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        // KEDA Service Bus queue-length scaler. One replica spins up per
        // pending poll-tenant message (one tenant = one session = one replica).
        rules: [
          {
            name: 'poll-tenant-queue'
            custom: {
              type: 'azure-servicebus'
              metadata: {
                queueName: 'poll-tenant'
                namespace: serviceBusNamespace
                messageCount: '1'  // 1 replica per pending poll message
              }
              auth: [
                {
                  secretRef: 'service-bus-connection'
                  triggerParameter: 'connection'
                }
              ]
            }
          }
        ]
      }
    }
  }
}

output id string = app.id
output name string = app.name
output principalId string = app.identity.principalId
