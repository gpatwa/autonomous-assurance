/**
 * Shared embedded types reused across canonical entities.
 * Source of truth: docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8
 */

import type { ConfidenceLevel, ObjectType, SourceSystem } from "./enums.js";

/** Who initiated an action or change */
export interface ActorInfo {
  type: "user" | "application" | "service-principal" | "system" | "kavachiq" | "unknown";
  id: string | null;
  displayName: string | null;
  agentIdentified: boolean;
  sessionId: string | null;
}

/** What object was affected */
export interface TargetInfo {
  objectType: ObjectType;
  /** KavachIQ internal ID (if tracked) or external ID */
  objectId: string;
  /** Microsoft Entra/M365 object ID */
  externalId: string;
  displayName: string;
}

/** How certain the system is about a claim */
export interface ConfidenceInfo {
  level: ConfidenceLevel;
  reasons: string[];
  missingFields: string[];
}

/** What data source supports a claim */
export interface ProvenanceInfo {
  primarySource: SourceSystem;
  corroboratingSources: SourceSystem[];
  conflictingSources: SourceSystem[];
  rawEventIds: string[];
}

/** Serialized object state at a point in time */
export interface StateSnapshot {
  /** Full serialized state (members, properties, config) */
  state: Record<string, unknown>;
  capturedAt: string;
  captureSource: SourceSystem;
  confidence: "authoritative" | "reconstructed" | "best-effort" | "unavailable";
  /** SHA-256 of normalized state for fast comparison */
  stateHash: string;
}

/** Standard time metadata on every entity */
export interface TimeMetadata {
  createdAt: string;
  updatedAt: string | null;
  schemaVersion: number;
}
