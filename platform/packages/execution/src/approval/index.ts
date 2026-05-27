/**
 * Approval token verification.
 *
 * The API creates ApprovalRecord.signature with the same canonical payload
 * shape and HMAC-SHA256 algorithm. The execution trust domain verifies it
 * again before creating any ActionInstance.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApprovalRecord, RecoveryStep } from "@kavachiq/schema";

export interface VerifyApprovalOptions {
  signingSecret: string;
  now?: Date;
}

export interface VerifyApprovalResult {
  ok: boolean;
  reason: string | null;
}

export function verifyApprovalForStep(
  approval: ApprovalRecord,
  step: RecoveryStep,
  opts: VerifyApprovalOptions,
): VerifyApprovalResult {
  const now = opts.now ?? new Date();
  if (!opts.signingSecret) return { ok: false, reason: "missing-signing-secret" };
  if (approval.invalidated) return { ok: false, reason: "approval-invalidated" };
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "approval-expired" };
  }
  if (approval.stepId !== step.stepId) return { ok: false, reason: "step-mismatch" };
  if (approval.targetObjectId !== step.targetObjectId) {
    return { ok: false, reason: "target-object-mismatch" };
  }
  if (approval.stateHashAtApproval !== step.currentStateAtPlan.stateHash) {
    return { ok: false, reason: "state-hash-mismatch" };
  }

  const expected = signApprovalPayload(approvalPayload(approval), opts.signingSecret);
  if (!safeEqualHex(approval.signature, expected)) {
    return { ok: false, reason: "signature-mismatch" };
  }
  return { ok: true, reason: null };
}

export function signApprovalPayload(
  payload: Record<string, unknown>,
  signingSecret: string,
): string {
  return createHmac("sha256", signingSecret).update(stableStringify(payload)).digest("hex");
}

export function approvalPayload(approval: ApprovalRecord): Record<string, unknown> {
  return {
    approvalId: approval.approvalId,
    tenantId: approval.tenantId,
    incidentId: approval.incidentId,
    planId: approval.planId,
    planVersion: approval.planVersion,
    stepId: approval.stepId,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
    stateHashAtApproval: approval.stateHashAtApproval,
    targetObjectId: approval.targetObjectId,
    targetState: approval.targetState,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
