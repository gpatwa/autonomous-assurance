# Cloudflare Pages marketing deploy runbook

**Status:** current deployment path for `agents.kavachiq.com`.
**Scope:** public marketing pages only. The protected console and product platform are separate runtimes.

## Architecture

| Surface | Host | Runtime | Deployment |
|---|---|---|---|
| Public marketing | `agents.kavachiq.com` | Cloudflare Pages static export | `kavachiq-agents-marketing` |
| Demo request intake | `agents.kavachiq.com/api/demo-request` | Cloudflare Pages Function | `functions/api/demo-request.ts` |
| Protected console / platform | separate service | Azure Container Apps | managed independently |

The existing Cloudflare Pages project `kavachiq-marketing` belongs to the parent `kavachiq.com` site. Do not deploy this repository to that project.

## Prerequisites

```bash
node -v                 # Node 20+ locally; CI uses Node 22 for Wrangler
npx wrangler whoami
```

The authenticated Cloudflare account must have Pages and DNS access for the `kavachiq.com` zone. The project name is `kavachiq-agents-marketing`.

For unattended deploys, use a Cloudflare API token with **Account → Cloudflare Pages → Edit** and **Zone → DNS → Edit** permissions. Store it locally as `CLOUDFLARE_API_TOKEN` or as the GitHub Actions secret with the same name. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` default to this repository's account and zone.

## First-time project setup

The sync command is idempotent and creates the Pages project, custom-domain binding, and DNS record when needed:

```bash
CLOUDFLARE_API_TOKEN=<token-with-pages-and-dns-edit> npm run sync:cloudflare
```

No dashboard or DNS edit is required for normal deploys.

Set the production secret used by the demo-request Function. Do not put the value in git:

```bash
npx wrangler pages secret put RESEND_API_KEY \
  --project-name kavachiq-agents-marketing
```

The Function defaults delivery to `team@kavachiq.com`. Set a different destination only when explicitly required:

```bash
npx wrangler pages secret put DEMO_REQUEST_TO_EMAIL \
  --project-name kavachiq-agents-marketing
```

## Deploy

From the repository root:

```bash
CLOUDFLARE_API_TOKEN=<token-with-pages-and-dns-edit> npm run sync:cloudflare
CLOUDFLARE_API_TOKEN=<token-with-pages-and-dns-edit> npm run deploy:marketing
```

`npm run sync:cloudflare` is idempotent: it creates the Pages project and custom-domain binding if absent, then updates the `agents` CNAME to the Pages hostname. The GitHub Actions workflow runs this automatically on pushes to `main`.

The `marketing/` app re-exports the public page components from `src/` and enables `output: "export"`. The root `functions/` directory is included as the Pages Function source when Wrangler packages the deployment.

## Custom domain and DNS

The sync command associates `agents.kavachiq.com` with the `kavachiq-agents-marketing` Pages project and reconciles its DNS record through the Cloudflare API. Cloudflare manages the TLS certificate after the record is valid.

The automation replaces the old Azure record with:

| Type | Name | Content |
|---|---|---|
| CNAME | `agents` | `kavachiq-agents-marketing.pages.dev` |

Keep the record DNS-only while Cloudflare validates the custom domain. If the Pages domain remains inactive after DNS propagation, check the Pages custom-domain status and use DNS-only for the record before retrying validation.

The dashboard path (**Workers & Pages → project → Custom domains**) is a diagnostic fallback only. Use it if the API reports a Cloudflare validation or CAA error.

Confirm the public host resolves to Pages, not the deleted Azure App Service origin:

```bash
dig +short CNAME agents.kavachiq.com @1.1.1.1
curl -I https://agents.kavachiq.com/
```

## Verification

```bash
SITE_URL=https://agents.kavachiq.com npm run verify:seo
MARKETING_URL=https://agents.kavachiq.com npm run verify:marketing
curl -fsS https://agents.kavachiq.com/robots.txt
curl -fsS https://agents.kavachiq.com/sitemap.xml
curl -fsS https://agents.kavachiq.com/google84fde4d05129ce2e.html
```

The demo form should be tested with a real request only after confirming the `RESEND_API_KEY` secret and recipient. Invalid payload smoke test:

```bash
curl -i -X POST https://agents.kavachiq.com/api/demo-request \
  -H 'content-type: application/json' \
  --data '{"name":"x","email":"invalid","company":"","useCase":""}'
```

Expected result: HTTP `422` with validation errors. Do not use a valid payload as a smoke test unless you intend to send an email to the configured demo inbox.

## Rollback

List recent deployments and use the Cloudflare dashboard to roll back the production deployment:

```bash
npx wrangler pages deployment list \
  --project-name kavachiq-agents-marketing
```

After rollback, rerun `verify:seo` and the public URL checks above.

## Notes

- `NEXT_PUBLIC_SITE_ORIGIN` is baked into the static build. Rebuild after changing it.
- `RESEND_API_KEY` is runtime-only and must remain a Pages secret.
- The current Function rate limit is isolate-local. Add Cloudflare Rate Limiting or Turnstile before high-volume public traffic.
- The legacy [Azure + Cloudflare runbook](AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md) describes the deleted App Service layout and is retained as historical deployment context.
