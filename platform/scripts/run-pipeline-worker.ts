/**
 * Pipeline-worker process entrypoint.
 *
 * Usage (local dev / smoke tests):
 *   SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://…" \
 *   DATABASE_URL="postgresql://…?sslmode=require" \
 *   tsx scripts/run-pipeline-worker.ts
 *
 * Future: this same script will be the Container App image's ENTRYPOINT
 * after a Dockerfile lands (week 2 / day 4).
 */

import { runPipelineWorker } from "@kavachiq/workers";

runPipelineWorker();
