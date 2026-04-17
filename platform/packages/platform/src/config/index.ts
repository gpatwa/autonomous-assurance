/**
 * Environment and config helpers.
 *
 * Pure string-level operations. No secret resolution. No Key Vault. No
 * certificate loading. Callers that need secrets resolve them at the edge
 * of the process they own.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError } from "../errors/index.js";

export type EnvSource = NodeJS.ProcessEnv;

/**
 * Load `.env` then `.env.local` (if present). Values from `.env.local`
 * override `.env`. Variables already set in the real environment win over
 * both. No third-party parser — the file format is `KEY=value` with
 * optional `#` line comments. Quotes around values are stripped.
 */
export function loadDotenvCascade(cwd: string = process.cwd()): void {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;
    const contents = readFileSync(path, "utf-8");
    applyDotenv(contents, process.env, name === ".env.local");
  }
}

function applyDotenv(contents: string, target: EnvSource, override: boolean): void {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (target[key] !== undefined && !override) continue;
    target[key] = value;
  }
}

export function requireEnv(name: string, env: EnvSource = process.env): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required env var: ${name}`, { envVar: name });
  }
  return value;
}

export function optionalEnv(
  name: string,
  fallback: string | undefined = undefined,
  env: EnvSource = process.env,
): string | undefined {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

export function envFlag(
  name: string,
  fallback: boolean = false,
  env: EnvSource = process.env,
): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new ConfigError(
    `Env var ${name} is not a boolean: got "${raw}"`,
    { envVar: name, value: raw },
  );
}

export function envInt(
  name: string,
  fallback?: number,
  env: EnvSource = process.env,
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(`Missing required env var: ${name}`, { envVar: name });
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new ConfigError(
      `Env var ${name} is not an integer: got "${raw}"`,
      { envVar: name, value: raw },
    );
  }
  return parsed;
}
