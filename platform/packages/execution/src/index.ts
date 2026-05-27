/**
 * Execution service entrypoint. Separate trust domain from read path.
 *
 * This service owns the write path. It deliberately depends only on
 * @kavachiq/schema -- never on @kavachiq/core or @kavachiq/api -- to
 * enforce trust domain separation.
 */

export * from "./approval/index.js";
export * from "./actions/index.js";
