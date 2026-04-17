/**
 * Structured logging + correlation-ID propagation.
 *
 * The default Logger writes JSON-line records to stderr. Correlation IDs
 * (and optional tenantId / actor) come from AsyncLocalStorage and are
 * attached automatically. Consumers that want a different sink implement
 * the Logger interface; the shape of each record stays the same.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

// ─── Levels ────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseLevel(raw: string | undefined, fallback: LogLevel = "info"): LogLevel {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return fallback;
}

// ─── Context ───────────────────────────────────────────────────────────────

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  actor?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function newCorrelationId(): string {
  return randomUUID();
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function withContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  const existing = storage.getStore();
  return storage.run({ ...existing, correlationId }, fn);
}

// ─── Logger ────────────────────────────────────────────────────────────────

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, err?: unknown, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to env LOG_LEVEL or "info". */
  level?: LogLevel;
  /** Bound fields included on every log line. */
  bindings?: Record<string, unknown>;
  /** Sink; defaults to stderr. Tests can swap. */
  write?: (line: string) => void;
}

class JsonLineLogger implements Logger {
  private readonly level: LogLevel;
  private readonly bindings: Record<string, unknown>;
  private readonly write: (line: string) => void;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? parseLevel(process.env.LOG_LEVEL);
    this.bindings = opts.bindings ?? {};
    this.write = opts.write ?? ((line) => process.stderr.write(`${line}\n`));
  }

  child(bindings: Record<string, unknown>): Logger {
    return new JsonLineLogger({
      level: this.level,
      bindings: { ...this.bindings, ...bindings },
      write: this.write,
    });
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit("debug", message, undefined, fields);
  }
  info(message: string, fields?: Record<string, unknown>): void {
    this.emit("info", message, undefined, fields);
  }
  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit("warn", message, undefined, fields);
  }
  error(message: string, err?: unknown, fields?: Record<string, unknown>): void {
    this.emit("error", message, err, fields);
  }

  private emit(
    level: LogLevel,
    message: string,
    err: unknown,
    fields: Record<string, unknown> | undefined,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const ctx = storage.getStore();
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.tenantId ? { tenantId: ctx.tenantId } : {}),
      ...(ctx?.actor ? { actor: ctx.actor } : {}),
      ...(fields ?? {}),
    };
    if (err !== undefined) {
      record.err = serializeError(err);
    }
    try {
      this.write(JSON.stringify(record));
    } catch {
      // Last-resort fallback. Never let a logger error crash the caller.
      this.write(`{"level":"error","message":"log serialization failed","original":"${message.replace(/"/g, '\\"')}"}`);
    }
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const base: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string") base.code = maybeCode;
    const maybeDetails = (err as { details?: unknown }).details;
    if (maybeDetails && typeof maybeDetails === "object") base.details = maybeDetails;
    return base;
  }
  return { value: String(err) };
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  return new JsonLineLogger(opts);
}

/** Process-wide default logger. Use for scripts; services should create their own with bindings. */
export const rootLogger: Logger = createLogger();
