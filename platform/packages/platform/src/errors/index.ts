/**
 * Error base class and exit-code constants.
 *
 * Every domain package subclasses PlatformError. API middleware shapes any
 * PlatformError into the documented error envelope. Services not on the
 * API path (workers, scripts, execution) log and re-throw.
 */

export interface PlatformErrorInit {
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class PlatformError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(code: string, message: string, opts?: PlatformErrorInit) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = opts?.details;
    this.cause = opts?.cause;
  }

  toJSON(): { name: string; code: string; message: string; details?: Record<string, unknown> } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isPlatformError(err: unknown): err is PlatformError {
  return err instanceof PlatformError;
}

export class ConfigError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFIG_MISSING", message, { details });
  }
}

export class InvariantError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INVARIANT_VIOLATION", message, { details });
  }
}

/**
 * Canonical exit codes for CLIs, scripts, and job runners. Matches common
 * sysexits(3) values so CI and orchestrators can differentiate outcomes.
 */
export const ExitCodes = {
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  UPSTREAM_UNAVAILABLE: 69,
  CONFIG: 78,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];
