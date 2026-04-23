# Agents subdomain — Azure + Cloudflare deploy runbook

**Status:** live as of 2026-04-22. Covers `agents.kavachiq.com` and `staging.kavachiq.com`.
**Audience:** on-call / new engineer. Assume nothing prior.
**Sibling doc:** [`AGENTS_SUBDOMAIN_SEO_PLAN.md`](AGENTS_SUBDOMAIN_SEO_PLAN.md) for the *why*. This doc is the *how*.

## TL;DR

Two App Services on one shared B1 plan, serving two hostnames. Both in `rg-kavachiq-staging`.

| Host | Azure resource | Env (`NEXT_PUBLIC_SITE_ORIGIN`) | Indexable? |
|---|---|---|---|
| `agents.kavachiq.com` | `kavachiq-agents` | `https://agents.kavachiq.com` | yes |
| `staging.kavachiq.com` | `kavachiq-staging` | `https://staging.kavachiq.com` | no (robots disallow) |

Drift check (run anytime): `SITE_URL=<host> npm run verify:seo`. 16/16 = matches this doc. Any failure = drift between doc and reality; reconcile before trusting either.

## Prerequisites

| Tool | Check | Notes |
|---|---|---|
| `az` CLI | `az --version` | `az login` → subscription `Visual Studio Enterprise Subscription` (ID `fb665ec0-d69f-49ef-a6e8-40b4a805ad8e`) |
| `node` | `node -v` | **Match Azure** — currently Node 20 LTS. Mismatch risk: build succeeds locally but runtime crashes on Azure. Use `nvm use 20` before the build step. |
| `npm` | from `node` install | |
| `zip` | `zip --version` | Used to assemble the standalone artifact |
| Cloudflare access | dash.cloudflare.com | DNS zone `kavachiq.com`. API token optional but useful for automation |

Sanity before any write:

```bash
az account show --query "{sub:name, tenant:tenantDisplayName, user:user.name}" -o table
# Must show Visual Studio Enterprise Subscription. Otherwise: az account set --subscription <id>
```

## Resource inventory

All resources are in **`rg-kavachiq-staging`** (Central US).

### App Service Plan

- **Name:** `plan-kavachiq-staging`
- **Tier:** B1 Basic, 1 instance (1.75 GB RAM shared)
- **Cost:** ~$13/mo, fixed regardless of how many apps it hosts (up to 3)
- **Currently hosts:** `kavachiq-staging`, `kavachiq-agents`
- **Upgrade trigger:** if either site gets real traffic. S1 unlocks deployment slots (cleaner staging→prod swap) at ~$70/mo.

### App Services

| Field | `kavachiq-staging` | `kavachiq-agents` |
|---|---|---|
| Default hostname | `kavachiq-staging.azurewebsites.net` | `kavachiq-agents.azurewebsites.net` |
| Custom hostname | `staging.kavachiq.com` | `agents.kavachiq.com` |
| Runtime | NODE \| 20-lts (Linux) | NODE \| 20-lts (Linux) |
| Startup command | `node server.js` | `node server.js` |
| Deploy method | `az webapp deploy --src-path <zip>` from laptop | `az webapp deploy --src-path <zip>` from laptop |

### App Settings (same keys on both apps, different values where noted)

| Key | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_ORIGIN` | **differs per app** | `https://agents.kavachiq.com` on `kavachiq-agents`, `https://staging.kavachiq.com` on `kavachiq-staging`. Drives robots/canonical/sitemap/JSON-LD. |
| `RESEND_API_KEY` | Resend dashboard | Used by `/api/demo-request`. Same value on both. |
| `DEMO_REQUEST_TO_EMAIL` | `team@kavachiq.com` | |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog dashboard | **Inlined at build** — changing requires rebuild, not restart |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` | Kudu hint |

### TLS certs (App Service Managed)

| Cert name (Azure resource) | Subject | Binding |
|---|---|---|
| `agents.kavachiq.com` | CN=agents.kavachiq.com | SNI-bound to `kavachiq-agents`/`agents.kavachiq.com` |
| (staging cert) | CN=staging.kavachiq.com | SNI-bound to `kavachiq-staging`/`staging.kavachiq.com` |

**Important:** the `az webapp config ssl list` command does **not** show App Service Managed Certificates. Use `az resource list --resource-type Microsoft.Web/certificates -g rg-kavachiq-staging` to see them. Thumbprint is at `properties.thumbprint` on the resource.

Managed certs auto-renew within 30 days of expiration. No action required unless DNS is changed — if you orange-cloud the Cloudflare CNAME before renewal, Azure can't reach the validation endpoint and renewal fails silently until you grey-cloud temporarily.

### Cloudflare DNS records (zone `kavachiq.com`)

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `agents` | `kavachiq-agents.azurewebsites.net` | **DNS only (grey cloud)** |
| TXT | `asuid.agents` | `718DF0D5AA899A582C2512F8766CF0CE54B084DF751F6F399914BA1D7AAF00C2` | n/a |
| CNAME | `staging` | `kavachiq-staging.azurewebsites.net` | proxied (orange) |
| TXT | `asuid.staging` | same verification ID | n/a |

**The verification ID is not a secret** — it's `customDomainVerificationId` from `az webapp show`, tied to the Azure subscription and effectively public. Same ID works for every app in this subscription.

**Grey vs orange cloud:**
- Custom-domain verification and managed-cert issuance/renewal require **grey cloud** on the CNAME (Azure needs to reach the origin directly).
- After the cert is bound and renewing cleanly, you can flip to orange (Cloudflare proxied) for CDN/WAF. `kavachiq-staging`'s CNAME is currently orange-cloud because its cert was bound before Cloudflare was added; don't re-issue without grey-clouding first.

## Rebuild from scratch — ordered steps

Use this if you're provisioning a new environment (e.g., a prod resource group separate from staging, or a DR rebuild).

**Placeholders** — replace these before running:
- `$SUB` — subscription ID
- `$RG` — resource group (e.g. `rg-kavachiq-prod`)
- `$PLAN` — plan name (e.g. `plan-kavachiq-prod`)
- `$APP` — app name (e.g. `kavachiq-agents`)
- `$HOST` — custom hostname (e.g. `agents.kavachiq.com`)
- `$ORIGIN` — `https://$HOST`
- `$CF_ZONE` — Cloudflare zone (e.g. `kavachiq.com`)

### 1. Subscription + RG

```bash
az account set --subscription "$SUB"
az group create -n "$RG" -l centralus   # idempotent; skip if exists
```

**Blast radius:** none; creates metadata only.

### 2. Plan

```bash
az appservice plan create -g "$RG" -n "$PLAN" --sku B1 --is-linux
```

**Blast radius:** starts billing (~$13/mo). Reversible via `az appservice plan delete`.

### 3. App Service

```bash
az webapp create \
  -g "$RG" -p "$PLAN" -n "$APP" \
  --runtime "NODE:20-lts"

az webapp config set \
  -g "$RG" -n "$APP" \
  --startup-file "node server.js"
```

**Blast radius:** App is reachable at `$APP.azurewebsites.net` serving the default "hello" page. No traffic yet because custom hostname/DNS not attached.

### 4. App Settings

Secrets come from whatever source of truth (1Password, Key Vault, repo's `.env.local` for one-off bootstraps). Do **not** check secrets into git.

```bash
az webapp config appsettings set -g "$RG" -n "$APP" --settings \
  NEXT_PUBLIC_SITE_ORIGIN="$ORIGIN" \
  RESEND_API_KEY="<value>" \
  DEMO_REQUEST_TO_EMAIL="team@kavachiq.com" \
  NEXT_PUBLIC_POSTHOG_KEY="<value>" \
  NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com" \
  WEBSITE_NODE_DEFAULT_VERSION="~20"
```

**Blast radius:** triggers app restart. `NEXT_PUBLIC_*` values do not retroactively change already-deployed prerendered pages — those are baked at build time.

### 5. Extract verification ID

```bash
VERIFY=$(az webapp show -g "$RG" -n "$APP" --query customDomainVerificationId -o tsv)
echo "Verification ID: $VERIFY"
echo "CNAME target:    $APP.azurewebsites.net"
```

### 6. Cloudflare DNS (by hand or via API)

Two records in zone `$CF_ZONE`:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `<subdomain>` | `$APP.azurewebsites.net` | **DNS only** |
| TXT | `asuid.<subdomain>` | `$VERIFY` | n/a |

Verify propagation before proceeding:

```bash
dig +short CNAME "$HOST" @1.1.1.1   # expect the azurewebsites.net target
dig +short TXT "asuid.$HOST" @1.1.1.1   # expect the verification ID
```

**Blast radius:** none until Azure validates in step 7.

### 7. Custom hostname binding

```bash
az webapp config hostname add \
  --webapp-name "$APP" -g "$RG" \
  --hostname "$HOST"
```

Expect `HostNameType: Verified`. If it errors with "Validation failed":
- Cloudflare record isn't propagated yet (wait 60s)
- CNAME is orange-cloud (flip to grey)
- `asuid` TXT content doesn't match (re-extract with step 5)

**Blast radius:** app begins serving `$HOST` without TLS. Plain HTTP works; HTTPS fails cert-trust until step 8.

### 8. Managed TLS cert + bind

```bash
az webapp config ssl create \
  --resource-group "$RG" --name "$APP" \
  --hostname "$HOST"
```

**The CLI returns immediately** with a "preview/in-progress" warning. The cert is actually created async over 2-8 minutes.

Poll for readiness:

```bash
until tb=$(az resource list \
    --resource-type "Microsoft.Web/certificates" -g "$RG" \
    --query "[?name=='$HOST'].{tb:properties.thumbprint}[0].tb" -o tsv) && [ -n "$tb" ]; do
  echo "waiting for cert…"; sleep 30
done
echo "Thumbprint: $tb"

az webapp config ssl bind \
  -g "$RG" -n "$APP" \
  --certificate-thumbprint "$tb" \
  --ssl-type SNI \
  --hostname "$HOST"
```

**Known gotcha:** `az webapp config ssl list` does **not** return managed certs. Always use `az resource list --resource-type Microsoft.Web/certificates`.

**Blast radius:** HTTPS on `$HOST` starts working; app still serves the default "hello" page until a real artifact is deployed.

### 9. Build + deploy artifact

From the repo root:

```bash
nvm use 20   # match Azure runtime; skip if already on Node 20
rm -rf .next
NEXT_PUBLIC_SITE_ORIGIN="$ORIGIN" npm run build

# Assemble Next.js standalone layout
cp -R .next/static .next/standalone/.next/static
cp -R public      .next/standalone/public

# Zip from inside the standalone dir so server.js is at archive root
(cd .next/standalone && zip -qr /tmp/$APP.zip .)

az webapp deploy \
  -g "$RG" -n "$APP" \
  --src-path /tmp/$APP.zip \
  --type zip --async false
```

**Blast radius:** app is briefly unreachable / mid-state during Kudu extract + restart (~60s). Reversible: redeploy the previous `/tmp/*.zip`.

**Keep the zip** — `cp /tmp/$APP.zip ~/deploys/$APP-$(date +%Y%m%d-%H%M).zip`. Rollback is faster than rebuilding.

### 10. Verify

```bash
SITE_URL="$ORIGIN" npm run verify:seo
```

Expect `✅ PASS` (16/16). Anything less = drift; do **not** hand the URL off until it's clean.

## Rollback

Any deploy goes bad, in order of preference:

1. **Redeploy the previous artifact zip** — fastest:
   ```bash
   az webapp deploy -g "$RG" -n "$APP" --src-path <previous-zip> --type zip --async false
   ```

2. **Swap to staging artifact** (if agents is broken and you need the site up at all):
   ```bash
   az webapp config appsettings set -g "$RG" -n kavachiq-agents \
     --settings NEXT_PUBLIC_SITE_ORIGIN=https://agents.kavachiq.com
   # rebuild agents artifact locally and redeploy
   ```
   (No true slot swap is available on B1 — see "Upgrade path" below.)

3. **Revert the Cloudflare CNAME target** to point `$HOST` at the old App Service. TTL is Auto (usually ~300s) so DNS flip is fast.

4. **Last resort — pause traffic:** set the Cloudflare CNAME to a 404 origin or delete the record. Better than serving broken content.

## Drift detection

```bash
# Every production deploy → expect 16/16 PASS
SITE_URL=https://agents.kavachiq.com npm run verify:seo

# Staging sanity → expect 16/16 PASS with non-public assertions
SITE_URL=https://staging.kavachiq.com npm run verify:seo
```

What a partial PASS means (see `scripts/verify-seo.ts` for the full 16 checks):
- `robots.txt` drift → often an App Settings vs deployed-artifact mismatch (env var changed but not rebuilt)
- `og:url` / `canonical` drift → same root cause; rebuild with the right `NEXT_PUBLIC_SITE_ORIGIN`
- JSON-LD missing → artifact predates the SEO pass (commit `7534053` or later); redeploy from current main
- TLS-related errors (curl fails) → cert expiry / renewal failure; flip CNAME to grey-cloud and re-bind

**Cadence recommendation:** after every deploy, and monthly as a cron (GitHub Actions or similar) to catch silent drift like cert expiry.

## Known gotchas (things that cost me an hour each)

1. **Managed cert creation is async despite exit 0.** The CLI's "in progress" warning is the real signal. Poll for 2-8 min.
2. **`az webapp config ssl list` doesn't show managed certs.** Use `az resource list --resource-type Microsoft.Web/certificates`.
3. **Grey-cloud is mandatory for cert issuance/renewal.** Orange-cloud works for serving but breaks validation.
4. **Node version match.** Build on the same major Node as the App Service runtime, or expect cryptic "module not found" / "syntax error" at startup.
5. **`NEXT_PUBLIC_*` and static prerendering.** An App Settings change restarts the app but doesn't update prerendered HTML / robots.txt / sitemap.xml. **Always rebuild after changing these.**
6. **Standalone zip layout.** `server.js` must be at archive root. `.next/standalone` is *not* automatically copied `.next/static` or `public` — you have to do it before zipping.

## Costs (ballpark)

| Thing | Monthly | Notes |
|---|---|---|
| App Service Plan B1 | ~$13 | fixed, shared between all apps on the plan |
| App Service (each) | $0 | billed via plan |
| Custom domain | $0 | included |
| Managed TLS cert | $0 | auto-renews |
| Cloudflare DNS | $0 | free tier |
| Outbound bandwidth | metered | trivial for current marketing-site traffic |

## Upgrade paths (deferred, but named)

1. **Plan tier S1** (~$70/mo) unlocks:
   - Deployment slots (blue/green for prod without downtime)
   - Autoscale
   - Daily backups
   Worth it when either site gets real traffic or the team wants safer prod pushes.

2. **Infrastructure-as-Code — Bicep for Azure + Terraform for Cloudflare.** Concrete next task:
   - Bicep module declaring `Microsoft.Web/serverfarms`, `Microsoft.Web/sites` (×2), `Microsoft.Web/sites/config/appsettings`, `Microsoft.Web/sites/hostNameBindings`, `Microsoft.Web/certificates`, the SNI binding.
   - Import existing resources via `az deployment group what-if` in import mode (or `az bicep decompile` against current state as a starting point).
   - Commit the Bicep file + a `bicep/deploy.sh` wrapper that runs `what-if` by default, `deploy` only with `--apply`.
   - Cloudflare DNS records as a small Terraform module with the CF provider. State in Azure Storage (the same RG).
   - Result: `bicep what-if` and `terraform plan` become the drift detector; `verify:seo` stays as the end-to-end assertion.
   - Scope: ~half-day of focused work, medium risk during the import step (wrong import = Bicep clobbers the live resource on next deploy). Do it in a separate branch with dry-runs reviewed by a second pair of eyes.

3. **CI for deploys.** Today deploys run from a laptop. Move to GitHub Actions (or Azure DevOps) once the repo has automated tests worth running pre-deploy. Skeleton:
   - Build job: checkout → `nvm use 20` → `NEXT_PUBLIC_SITE_ORIGIN=<env> npm run build` → assemble zip → upload artifact.
   - Deploy job (manual approval gate): download artifact → `az webapp deploy` → `verify:seo`.
   - Same script drives staging and prod by `env:` injection.

4. **Search Console automation.** `gsc` or the official Google Webmaster Tools API — script sitemap submission + indexation status checks. Low priority; once-per-env.

## Contact / ownership

- **Azure subscription owner:** same human as the git committer (govindpatwa@hotmail.com as of this writing).
- **Cloudflare zone owner:** same (account screenshot showed `kavachiq.com` in a free plan).
- **Escalation:** for this runbook's accuracy, file against the repo; for live-site outages, check `az webapp log tail` first, then Azure portal's App Service diagnostics.
