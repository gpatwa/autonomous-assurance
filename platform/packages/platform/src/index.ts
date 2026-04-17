/**
 * @kavachiq/platform — cross-cutting plumbing shared across services.
 *
 * Design contract: this package resolves no secrets, performs no Graph
 * writes, and never imports from @kavachiq/core, api, workers, or
 * execution. It is safe for both the read-path and the execution service
 * to depend on directly.
 *
 * See: docs/SHARED_PLATFORM_LAYER_DESIGN.md
 */

export * from "./config/index.js";
export * from "./observability/index.js";
export * from "./errors/index.js";
export * from "./utils/index.js";
