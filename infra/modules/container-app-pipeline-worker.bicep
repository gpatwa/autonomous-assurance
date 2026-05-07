// Container App: pipeline-worker.
// D4 + N8 + N9: Service Bus session-keyed consumer with KEDA scaling on
// queue length. Pulls images from ACR using the shared user-assigned managed
// identity (UAMI) — no admin credentials required (Week 5 hardening).
//
// Secrets (Service Bus connection, DATABASE_URL) are stored as Container
// App secrets, not env vars. Container App secret refs flow into env at
// runtime without exposing values in the resource manifest.

@description('Container App name.')
param name string

@description('Region.')
param location string

@description('Container Apps managed environment ID.')
param managedEnvironmentId string

@description('ACR login server (e.g. kavachiqplatformdevacr.azurecr.io).')
param acrLoginServer string

@description('Resource ID of the user-assigned managed identity used for ACR pull.')
param uamiId string

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

@description('Service Bus namespace name (for KEDA queue-length scaling).')
param serviceBusNamespace string

@description('CPU cores per replica.')
param cpu string = '0.25'

@description('Memory per replica.')
param memory string = '0.5Gi'

@description('Min replicas. 1 = always-on (KEDA scale-from-zero unreliable for session queues).')
param minReplicas int = 1

@description('Max replicas (KEDA scales between min and max based on queue length).')
param maxReplicas int = 10

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiId}': {}
    }
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
      ]
      registries: [
        {
          server: acrLoginServer
          identity: uamiId  // UAMI has AcrPull granted in acr.bicep; no password needed
        }
      ]
      ingress: null  // worker — no external ingress
    }
    template: {
      containers: [
        {
          name: 'pipeline-worker'
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
        // KEDA Service Bus queue-length scaler. Worker scales out when the
        // process-events queue accumulates messages.
        rules: [
          {
            name: 'process-events-queue'
            custom: {
              type: 'azure-servicebus'
              metadata: {
                queueName: 'process-events'
                namespace: serviceBusNamespace
                messageCount: '10'  // 1 replica per 10 queued messages, up to maxReplicas
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
