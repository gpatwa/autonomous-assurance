/**
 * KavachIQ REST API — public surface.
 *
 * `createApiServer` — factory for in-process use (tests, smoke scripts).
 * `runApiServer`    — process entrypoint for the Container App image.
 */

export { createApiServer } from "./server.js";
export type { ApiServer, ApiServerOptions } from "./server.js";

export { runApiServer } from "./run-api-server.js";
