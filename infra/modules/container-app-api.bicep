// Container App: api server.
// Exposes GET /health, /tenants/:id/incidents, /tenants/:id/changes.
// External HTTP ingress — the operator console calls this over HTTPS.
// No KEDA: scales 1-N on HTTP request concurrency (Container Apps built-in).

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

@description('Static Bearer API key. Console sends this in Authorization header.')
@secure()
param apiKey string

@description('HMAC signing secret used to create recovery approval signatures.')
@secure()
param recoveryApprovalSigningSecret string

@description('Postgres URL with sslmode=require.')
@secure()
param databaseUrl string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Console URL — used to build the admin-consent redirect URI.')
param consoleUrl string

@description('KavachIQ multi-tenant Entra app client ID (passed to KAVACHIQ_APP_CLIENT_ID env).')
param kavachiqAppClientId string

@description('Service Bus connection string — used to enqueue first poll-tenant on onboarding.')
@secure()
param serviceBusConnection string

@description('CPU cores per replica.')
param cpu string = '0.25'

@description('Memory per replica.')
param memory string = '0.5Gi'

@description('Min replicas. 0 = scale-to-zero (OK for HTTP — first-request cold start ~2s).')
param minReplicas int = 1

@description('Max replicas.')
param maxReplicas int = 5

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
          name: 'api-key'
          value: apiKey
        }
        {
          name: 'recovery-approval-signing-secret'
          value: recoveryApprovalSigningSecret
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
          name: 'service-bus-connection'
          value: serviceBusConnection
        }
      ]
      registries: [
        {
          server: acrLoginServer
          identity: uamiId  // UAMI has AcrPull granted in acr.bicep; no password needed
        }
      ]
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'API_KEY'
              secretRef: 'api-key'
            }
            {
              name: 'RECOVERY_APPROVAL_SIGNING_SECRET'
              secretRef: 'recovery-approval-signing-secret'
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
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'KAVACHIQ_CONSOLE_URL'
              value: consoleUrl
            }
            {
              name: 'KAVACHIQ_APP_CLIENT_ID'
              value: kavachiqAppClientId  // not a secret; the client ID is public
            }
            {
              name: 'SERVICE_BUS_CONNECTION_STRING'
              secretRef: 'service-bus-connection'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 3
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        // Default HTTP scaling: Container Apps scales on concurrent requests.
        // No explicit KEDA rule needed — built-in HTTP scaler activates at 10 RPS/replica.
      }
    }
  }
}

output id string = app.id
output name string = app.name
// Full HTTPS URL — set as KAVACHIQ_API_URL in the console's env.
output fqdn string = 'https://${app.properties.configuration.ingress.fqdn}'
