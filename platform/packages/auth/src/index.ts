/**
 * @kavachiq/auth — authentication primitives.
 *
 * D5: Microsoft Entra External ID issues operator JWTs.
 *
 * What this module owns:
 *   - JWT validation (issuer + audience + signing key from External ID JWKS).
 *   - Tenant-context extraction: parse `tenant_id` claim, expose to API
 *     middleware that sets Postgres `app.tenant_id`.
 *   - Operator role enforcement (`admin`, `operator`, `viewer`, `kavachiq-staff`).
 *   - Multi-tenant Microsoft app token mint (D1): per-tenant
 *     client_credentials grant via OAuth.
 *
 * Entry points (forthcoming):
 *   - `verifyOperatorJwt(token)` — used by API middleware.
 *   - `extractTenantContext(jwt)` — returns { tenantId, operatorId, role }.
 *   - `mintGraphToken(tenantId, scope)` — per-tenant Microsoft Graph token.
 *
 * This module is a skeleton awaiting week 4 implementation per
 * docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md §6.
 */

export {};
