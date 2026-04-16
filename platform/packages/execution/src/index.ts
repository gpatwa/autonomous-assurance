/**
 * Execution service entrypoint. Separate trust domain from read path.
 *
 * This service owns the write path: it receives approved remediation plans,
 * verifies approval tokens, validates pre-conditions, executes Graph API
 * writes, and publishes execution audit events. It deliberately depends
 * only on @kavachiq/schema -- never on @kavachiq/core or @kavachiq/api --
 * to enforce trust domain separation.
 */

export {};
