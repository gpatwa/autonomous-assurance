/**
 * @kavachiq/schema — Canonical data model for the KavachIQ platform.
 *
 * This package is the single source of truth for entity types and enums.
 * All services import types from here. Schema drift is caught at compile time.
 *
 * Source of truth: docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md
 */

export * from "./enums.js";
export * from "./shared-types.js";
export * from "./entities.js";
