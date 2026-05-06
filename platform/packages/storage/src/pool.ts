/**
 * Postgres connection pool.
 *
 * Reads connection settings from env vars (DATABASE_URL preferred, individual
 * vars as fallback). The pool is module-scoped — created once per process,
 * reused across requests. Workers and the API instantiate one pool at startup;
 * tests instantiate per-suite or per-test.
 *
 * D2: every connection acquisition MUST set `app.tenant_id` before running
 *     queries. The `withTenantContext` helper (tenant-context.ts) is the only
 *     supported way to acquire a connection in application code; direct
 *     `pool.connect()` is reserved for migrations and admin tooling.
 *
 * TLS is required against Azure Postgres Flex; we set `ssl: { rejectUnauthorized: true }`
 * by default. For local docker-compose Postgres, set `DATABASE_SSL=disable`.
 */

import { Pool, type PoolConfig } from "pg";

export interface PoolEnv {
  DATABASE_URL?: string;
  DATABASE_HOST?: string;
  DATABASE_PORT?: string;
  DATABASE_NAME?: string;
  DATABASE_USER?: string;
  DATABASE_PASSWORD?: string;
  DATABASE_SSL?: string; // "disable" | undefined (default = strict TLS)
  DATABASE_MAX_CONNECTIONS?: string;
}

/**
 * Build a PoolConfig from env vars. Exported for testability — production
 * code should call `getPool()` (below) which memoizes.
 */
export function buildPoolConfig(env: PoolEnv = process.env): PoolConfig {
  const max = env.DATABASE_MAX_CONNECTIONS
    ? parseInt(env.DATABASE_MAX_CONNECTIONS, 10)
    : 5; // N8: 5 conns × KEDA max replicas should stay under PG max_connections (100 on B1ms).

  // Don't crash on idle clients erroring out — log and let the pool reconnect.
  const baseConfig: PoolConfig = {
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "kavachiq",
  };

  if (env.DATABASE_URL) {
    return {
      ...baseConfig,
      connectionString: env.DATABASE_URL,
      ssl: shouldUseSsl(env) ? { rejectUnauthorized: true } : false,
    };
  }

  // Individual vars fallback
  if (!env.DATABASE_HOST || !env.DATABASE_USER || !env.DATABASE_PASSWORD) {
    throw new Error(
      "Storage: DATABASE_URL not set; falling back to individual vars but DATABASE_HOST / DATABASE_USER / DATABASE_PASSWORD are missing.",
    );
  }
  return {
    ...baseConfig,
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT ? parseInt(env.DATABASE_PORT, 10) : 5432,
    database: env.DATABASE_NAME ?? "kavachiq",
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    ssl: shouldUseSsl(env) ? { rejectUnauthorized: true } : false,
  };
}

function shouldUseSsl(env: PoolEnv): boolean {
  return env.DATABASE_SSL !== "disable";
}

let cachedPool: Pool | null = null;

/**
 * Process-wide pool. First call constructs; subsequent calls return the same
 * instance. Call `closePool()` at shutdown.
 */
export function getPool(env: PoolEnv = process.env): Pool {
  if (cachedPool) return cachedPool;
  const cfg = buildPoolConfig(env);
  cachedPool = new Pool(cfg);
  cachedPool.on("error", (err) => {
    // Pool emits 'error' on idle clients; logged so we know but don't crash.
    // eslint-disable-next-line no-console
    console.error("[@kavachiq/storage] idle client error", err);
  });
  return cachedPool;
}

/** Close the cached pool (used at shutdown + in tests). */
export async function closePool(): Promise<void> {
  if (!cachedPool) return;
  const p = cachedPool;
  cachedPool = null;
  await p.end();
}
