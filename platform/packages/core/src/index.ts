/**
 * @kavachiq/core - Domain logic for the read path.
 *
 * This package contains the core domain modules for ingesting, normalizing,
 * correlating, and detecting incidents from Microsoft 365 audit signals.
 */

export * as ingestion from "./ingestion/index.js";
export * as normalization from "./normalization/index.js";
export * as correlation from "./correlation/index.js";
export * as detection from "./detection/index.js";
export * as blastRadius from "./blast-radius/index.js";
export * as baselines from "./baselines/index.js";
export * as planning from "./planning/index.js";
export * as audit from "./audit/index.js";
