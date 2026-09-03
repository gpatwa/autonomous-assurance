/**
 * Reconcile the Cloudflare Pages project, custom domain, and DNS record.
 *
 * Requires a Cloudflare API token with Pages Edit and DNS Edit permissions.
 * Account and zone IDs are public identifiers, but can be overridden for a
 * different account or zone through environment variables.
 */

const PROJECT_NAME = "kavachiq-agents-marketing";
const CUSTOM_DOMAIN = "agents.kavachiq.com";
const PAGES_TARGET = `${PROJECT_NAME}.pages.dev`;
const DEFAULT_ACCOUNT_ID = "293e96447b7a5b86220246d284daa4b6";
const DEFAULT_ZONE_ID = "17731f09cb3cf0e541a89fd9dcc9b8b6";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? DEFAULT_ZONE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!apiToken) {
  throw new Error(
    "CLOUDFLARE_API_TOKEN is required (Pages Edit + DNS Edit permissions).",
  );
}

type CloudflareResponse<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
};

type DnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
};

const apiBase = "https://api.cloudflare.com/client/v4";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json()) as CloudflareResponse<T>;

  if (!response.ok || !body.success) {
    const details = body.errors?.map((error) => `${error.code}: ${error.message}`).join("; ");
    throw new Error(`Cloudflare API ${init.method ?? "GET"} ${path} failed: ${details ?? response.statusText}`);
  }

  return body.result;
}

async function ensurePagesProject(): Promise<void> {
  const path = `/accounts/${accountId}/pages/projects/${PROJECT_NAME}`;
  const existing = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (existing.ok) return;
  if (existing.status !== 404) {
    throw new Error(`Cloudflare Pages project lookup failed: ${existing.status} ${existing.statusText}`);
  }

  await request(`/accounts/${accountId}/pages/projects`, {
    method: "POST",
    body: JSON.stringify({ name: PROJECT_NAME, production_branch: "main" }),
  });
  console.log(`Created Pages project ${PROJECT_NAME}.`);
}

async function ensureCustomDomain(): Promise<void> {
  const path = `/accounts/${accountId}/pages/projects/${PROJECT_NAME}/domains`;
  const domains = await request<Array<{ name: string }>>(path);

  if (domains.some((domain) => domain.name === CUSTOM_DOMAIN)) return;

  await request(path, {
    method: "POST",
    body: JSON.stringify({ name: CUSTOM_DOMAIN }),
  });
  console.log(`Added custom domain ${CUSTOM_DOMAIN}.`);
}

async function ensureDnsRecord(): Promise<void> {
  const path = `/zones/${zoneId}/dns_records?name=${encodeURIComponent(CUSTOM_DOMAIN)}`;
  const records = await request<DnsRecord[]>(path);
  const conflicting = records.filter((record) => record.type !== "CNAME");

  if (conflicting.length > 0) {
    const types = conflicting.map((record) => record.type).join(", ");
    throw new Error(`Cannot reconcile ${CUSTOM_DOMAIN}: conflicting DNS record types found (${types}).`);
  }

  const payload = {
    type: "CNAME",
    name: CUSTOM_DOMAIN,
    content: PAGES_TARGET,
    ttl: 1,
    proxied: false,
  };
  const existing = records[0];

  if (existing?.content === PAGES_TARGET && existing.proxied === false) {
    console.log(`DNS already points ${CUSTOM_DOMAIN} to ${PAGES_TARGET}.`);
    return;
  }

  if (existing) {
    await request(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    console.log(`Updated ${CUSTOM_DOMAIN} CNAME to ${PAGES_TARGET}.`);
    return;
  }

  await request(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(`Created ${CUSTOM_DOMAIN} CNAME to ${PAGES_TARGET}.`);
}

async function main(): Promise<void> {
  await ensurePagesProject();
  await ensureCustomDomain();
  await ensureDnsRecord();
  console.log("Cloudflare marketing configuration is reconciled.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export {};
