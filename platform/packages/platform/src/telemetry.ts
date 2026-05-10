/**
 * Application Insights initialisation.
 *
 * Call `initTelemetry()` as the FIRST import in each worker/server entrypoint
 * — before any other module is loaded — so the SDK can auto-instrument
 * outgoing HTTP, Service Bus, and PostgreSQL calls.
 *
 * No-op when APPLICATIONINSIGHTS_CONNECTION_STRING is unset (local dev).
 */

let started = false;

export function initTelemetry(role: string): void {
  const connStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connStr || started) return;
  started = true;

  // Dynamic import keeps the SDK out of the module graph entirely when
  // the env var is absent (test / local environments).
  import("applicationinsights").then((ai) => {
    ai.setup(connStr)
      .setAutoCollectRequests(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectPerformance(true, true)
      .setUseDiskRetryCaching(false)
      .start();

    // Tag every telemetry item with the worker/service name so Azure Monitor
    // can filter by role in the Application Map.
    ai.defaultClient.context.tags[ai.defaultClient.context.keys.cloudRole] = "kavachiq";
    ai.defaultClient.context.tags[ai.defaultClient.context.keys.cloudRoleInstance] = role;
  }).catch(() => {
    // Non-fatal — telemetry failure must never crash the service.
  });
}
