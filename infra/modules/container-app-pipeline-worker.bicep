// Container App: pipeline-worker.
// D4 + N8 + N9: Service Bus session-keyed consumer with KEDA scaling on
// queue length. System-assigned managed identity granted AcrPull on the
// registry so the image pull is credential-free.
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

@description('ACR resource name (in the same RG) for AcrPull role assignment.')
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

@description('Service Bus namespace name (for KEDA queue-length scaling).')
param serviceBusNamespace string

@description('CPU cores per replica.')
param cpu string = '0.25'

@description('Memory per replica.')
param memory string = '0.5Gi'

@description('Min replicas (0 = scale-to-zero on idle).')
param minReplicas int = 0

@description('Max replicas (KEDA scales between min and max based on queue length).')
param maxReplicas int = 10

// Reference the existing ACR (in same RG) so we can read admin creds at
// deploy time. listCredentials() returns username/password for the registry
// only at deployment-action evaluation time; values aren't stored in the
// Bicep template or in deployment outputs.
resource acrRef 'Microsoft.ContainerRegistry/registries@2024-11-01-preview' existing = {
  name: acrName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'SystemAssigned'  // kept; future-ready for managed-identity ACR pull
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

// Note: AcrPull role assignment for the managed identity is intentionally
// NOT created here. Container Apps + system-assigned-identity + private ACR
// has a known bootstrap deadlock — the first image pull happens before the
// role assignment propagates, the deployment expires, and Bicep marks the
// resource Failed. We use ACR admin credentials (above) for v1; the system
// identity is provisioned but not yet used. Track managed-identity pull as
// a week-4 hardening pass.

output id string = app.id
output name string = app.name
output principalId string = app.identity.principalId
