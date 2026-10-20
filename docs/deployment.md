# Deployment (on-premises, Docker)

## Prerequisites
Docker Engine 24+ with Compose v2 on a Linux host inside the FinBank network; reachability to AD (LDAPS 636), the Flexcube gateway, and (later) the AML vendor; a TLS-terminating reverse proxy (nginx / F5) in front of port 8080 — a PWA and its service worker require HTTPS on tablets.

## First install
```bash
cd Finbank-Digital-Onboarding
cp deploy/.env.example deploy/.env            # fill POSTGRES_PASSWORD, JWT_SECRET, STORAGE_ENCRYPTION_KEY, LDAP_*, FLEXCUBE_*
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d            # app runs migrations on start
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile tools run --rm -e SEED_DEMO=false seed   # reference data: branches, products, docs, rules
```
Open `https://<host>/`. On a tablet, "Add to home screen" installs the PWA. Health: `GET /api/health`.

**Users:** reference seed creates demo users for UAT. For production, provision real users (Admin → Users, or SQL) with their AD `sAMAccountName`, branch and staff code; the role comes from the AD group map. Remove demo users before go-live.

## Upgrades
`docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` — new SQL files in `apps/api/src/db/migrations/` are applied once (tracked in `schema_migrations`).

## Backups
* Postgres: nightly `docker compose exec db pg_dump -U finbank -Fc finbank > finbank-$(date +%F).dump`.
* Documents volume `docs` (encrypted blobs) **and** `STORAGE_ENCRYPTION_KEY` (store separately, e.g. vault/HSM): without the key the documents are unrecoverable.

## Switching integrations
| Variable | Values |
|---|---|
| `AUTH_MODE` | `ldap` (prod) / `mock` (dev: any seeded user, password `Finbank@2026`) |
| `FLEXCUBE_MODE` | `soap` / `mock` (`FLEXCUBE_MOCK_FAIL_RATE` for drills) |
| `AML_MODE` | `http` / `mock` |

## Local development (no Docker)
```bash
npm ci
# Postgres 17 with db finbank + finbank_test (user/password finbank)
cd apps/api && DATABASE_URL=postgres://finbank:finbank@localhost:5432/finbank npm run migrate && npm run seed && npm run dev   # :8080
cd apps/web && npm run dev            # :5173, proxies /api
npm test                         # API (vitest+supertest against finbank_test) + web unit tests
npm run build && node scripts/screenshots.mjs   # needs a running server and Chrome
```
