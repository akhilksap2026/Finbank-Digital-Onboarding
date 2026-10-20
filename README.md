# FinBank Burundi — Digital Account Opening Platform

Staff-operated account opening for **FinBank S.A. (Burundi)**: branch counters (web) and field agents (installable tablet PWA, offline-first), in **French, English and Kirundi**.
It digitises the official FinBank account-opening forms, runs KYC/AML controls, routes applications through a configurable approval chain and opens customers and accounts in **Oracle Flexcube 14.0**.

## Highlights
- **Journeys:** individual, joint, corporate, Akabirya (minor + guardian); additional accounts and KYC updates for existing customers; duplicate-customer search.
- **Controls:** shared server-authoritative validation, per-product document checklist, mandatory signed-form scan, AML screening of every party, risk scoring, PEP/EDD cases, maker-checker.
- **Approval chain:** clerk → branch head → operations / compliance (edge cases) → MD/CEO (exceptional), driven by configurable routing rules with SLAs.
- **Core banking:** Flexcube `CreateCustomer` / `CreateCustAcc` via SOAP gateway, idempotent, with a prefilled manual-opening fallback.
- **13 role dashboards & 8 department workspaces** (Operations/CASA, Compliance, Digital, Cards/Cheques, Customer service, Risk, IT, Internal audit), RBAC enforced server-side.
- **Security & data protection (Law 1/03 of 2026):** AD/LDAP login, PIN auto-lock, encrypted tablet storage, AES-256-GCM documents, remote device lock/wipe, immutable hash-chained audit trail.
- **PDF pack:** faithful vector re-creation of the official forms + KYC/AML annex ([samples](samples/)).

## Screenshots
| | |
|---|---|
| ![Login](docs/screenshots/01-login.png) | ![Clerk dashboard](docs/screenshots/03-dashboard-clerk.png) |
| ![Journey – parties](docs/screenshots/18-journey-03-titulaires-parties.png) | ![Journey – review](docs/screenshots/25-journey-10-verification-soumission.png) |
| ![MD approval](docs/screenshots/29-approval-md-exceptional.png) | ![Compliance workspace](docs/screenshots/33-workspace-compliance.png) |
| ![MD dashboard](docs/screenshots/08-dashboard-md.png) | ![PDF form](docs/screenshots/51-pdf-corporate-02.png) |

All screens: [`docs/screenshots/`](docs/screenshots/).

## Repository layout
```
apps/api          Node 20 + Express + TypeScript API (Postgres 17, migrations, seed, tests, PDF renderer)
apps/web          React 18 + Vite PWA (offline IndexedDB, i18n FR/EN/RN)
packages/shared   Domain model and validation shared by API and web
deploy/           Dockerfile, docker-compose.yml, .env.example
docs/             architecture, deployment, open items, assessment, benchmark, forms mapping, UI system, screenshots
scripts/          screenshot capture, sample PDF generation
samples/          sample filled PDF packs
```

## Quickstart (development)
Requirements: Node 20, Postgres 17 with databases `finbank` and `finbank_test` (user/password `finbank`).
```bash
npm ci
npm run typecheck && npm test && npm run build
cd apps/api
export DATABASE_URL=postgres://finbank:finbank@localhost:5432/finbank
npm run migrate && npm run seed        # reference + demo data
npm run dev                            # API on :8080 (serves apps/web/dist)
# optional: cd apps/web && npm run dev  # Vite on :5173, proxies /api
```
Demo users (mock auth only): `clerk1, agent1, bh1, ops1, comp1, md1, audit1, admin1, it1, digital1, cards1, cs1, risk1` / `Finbank@2026`.

## Deployment
On-premises Docker: see [`docs/deployment.md`](docs/deployment.md).
```bash
cp deploy/.env.example deploy/.env   # fill secrets, LDAP, Flexcube
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

## Documentation
[Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Open items](docs/open-items.md) · [Assessment](docs/assessment.md) · [Benchmark](docs/benchmark.md) · [Forms mapping](docs/forms-mapping.md) · [UI system](docs/ui-system.md)

## License
Proprietary — © 2026 FinBank S.A. All rights reserved. See [LICENSE](LICENSE).
