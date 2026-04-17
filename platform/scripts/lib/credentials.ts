/**
 * Script-local Graph credential bootstrap.
 *
 * This file resolves SP secrets and builds Azure Identity credentials.
 * It lives in `scripts/lib/` — NOT in @kavachiq/platform — because
 * secret/credential resolution must stay at service/script edges. The
 * shared platform package must not import this.
 *
 * Cert auth is preferred; client-secret fallback is accepted for early
 * Phase 0 only and must be replaced with cert auth before Phase 1.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ClientCertificateCredential,
  ClientSecretCredential,
  type TokenCredential,
} from "@azure/identity";
import { ConfigError, optionalEnv, requireEnv } from "@kavachiq/platform";
import type { TokenProvider } from "./transport.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export type SpKind = "read" | "execute";

export interface SpCredentials {
  kind: SpKind;
  tenantId: string;
  clientId: string;
  /** Azure Identity credential. Kept here, not exposed via the transport. */
  credential: TokenCredential;
}

export function loadSpCredentials(kind: SpKind): SpCredentials {
  const prefix = kind === "read" ? "SP_READ" : "SP_EXECUTE";
  const tenantId = requireEnv(`${prefix}_TENANT_ID`);
  const clientId = requireEnv(`${prefix}_CLIENT_ID`);
  const certificatePath = optionalEnv(`${prefix}_CERTIFICATE_PATH`);
  const clientSecret = optionalEnv(`${prefix}_CLIENT_SECRET`);

  const credential = buildCredential({
    kind,
    tenantId,
    clientId,
    certificatePath,
    clientSecret,
  });
  return { kind, tenantId, clientId, credential };
}

function buildCredential(input: {
  kind: SpKind;
  tenantId: string;
  clientId: string;
  certificatePath: string | undefined;
  clientSecret: string | undefined;
}): TokenCredential {
  const { kind, tenantId, clientId, certificatePath, clientSecret } = input;
  if (certificatePath) {
    const pem = readFileSync(resolve(certificatePath), "utf-8");
    return new ClientCertificateCredential(tenantId, clientId, { certificate: pem });
  }
  if (clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  const prefix = kind === "read" ? "SP_READ" : "SP_EXECUTE";
  throw new ConfigError(
    `Missing credentials for SP-${kind.toUpperCase()}: set ${prefix}_CERTIFICATE_PATH ` +
      `(preferred) or ${prefix}_CLIENT_SECRET (fallback for early Phase 0).`,
    { spKind: kind },
  );
}

export function tokenProviderFor(creds: SpCredentials): TokenProvider {
  return {
    async getToken(): Promise<string> {
      const token = await creds.credential.getToken(GRAPH_SCOPE);
      if (!token) {
        throw new ConfigError(
          `Failed to acquire Graph token for SP-${creds.kind.toUpperCase()}`,
          { spKind: creds.kind },
        );
      }
      return token.token;
    },
  };
}
