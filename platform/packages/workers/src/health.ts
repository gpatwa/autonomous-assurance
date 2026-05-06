/**
 * Liveness + readiness HTTP server (N9).
 *
 * Two endpoints:
 *   GET /health/live   — process is alive. Always 200 unless deadlocked.
 *                        Container Apps restarts replicas that fail this.
 *   GET /health/ready  — process can take traffic. Returns 503 when:
 *                          - graceful shutdown in progress (SIGTERM)
 *                          - core dependencies unreachable (Postgres/Service Bus)
 *                        Container Apps removes from rotation on 503.
 *
 * Deliberately uses node:http (no framework) — health endpoints should
 * never share a dependency with the workload they're reporting on.
 */

import http from "node:http";

export interface HealthState {
  ready: boolean;
  /** Optional reason returned when ready=false (e.g., "shutting-down", "db-down"). */
  reason?: string;
}

export interface HealthServer {
  /** Update the readiness state at runtime. */
  setReady(ready: boolean, reason?: string): void;
  /** Stop accepting connections. */
  close(): Promise<void>;
}

export function startHealthServer(
  state: HealthState = { ready: false },
  port: number = parseInt(process.env.HEALTH_PORT ?? "8080", 10),
): HealthServer {
  const current = { ...state };

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      return res.end();
    }
    if (req.url === "/health/live") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ status: "live" }));
    }
    if (req.url === "/health/ready") {
      if (current.ready) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ status: "ready" }));
      }
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ status: "not-ready", reason: current.reason ?? null }));
    }
    res.statusCode = 404;
    res.end();
  });

  server.listen(port);

  return {
    setReady(ready: boolean, reason?: string) {
      current.ready = ready;
      current.reason = reason;
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
