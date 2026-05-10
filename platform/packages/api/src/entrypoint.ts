/**
 * Docker entrypoint — explicitly starts the API server.
 *
 * Keeping this separate from run-api-server.ts lets tests import
 * `createApiServer` from `@kavachiq/api` without triggering the
 * server startup side-effect. Same pattern as run-pipeline-worker.ts.
 */
import { runApiServer } from "./run-api-server.js";

runApiServer();
