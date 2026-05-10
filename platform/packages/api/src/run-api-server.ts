/**
 * Process entrypoint for the KavachIQ API server.
 *
 * Required env:
 *   DATABASE_URL   — Postgres connection string
 *   API_KEY        — static Bearer token for authentication
 *
 * Optional:
 *   PORT           — HTTP port (default: 3000)
 */

import { initTelemetry } from "@kavachiq/platform";
initTelemetry("api");

import { closePool } from "@kavachiq/storage";
import { rootLogger } from "@kavachiq/platform";
import { createApiServer } from "./server.js";

export async function runApiServer(): Promise<void> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("Required env API_KEY not set");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Required env DATABASE_URL not set");
    process.exit(1);
  }

  const port = parseInt(process.env.PORT ?? "3000", 10);
  const server = createApiServer({ apiKey, port });

  const shutdown = async () => {
    rootLogger.info("api: shutting down");
    await server.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await server.listen();
}

runApiServer();
