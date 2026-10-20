# Contributing

Internal FinBank project. Contributions are by authorised staff and contractors only.

## Workflow
1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
2. Keep dependencies pinned to exact versions (`.npmrc` has `save-exact=true`); commit `package-lock.json`.
3. Before opening a PR run `npm ci && npm run typecheck && npm test && npm run build` (needs Postgres 17 with a `finbank_test` database, see `docs/deployment.md`).
4. Open a pull request using the template; CI must pass and a CODEOWNER must approve.
5. Database changes go in a **new** file in `apps/api/src/db/migrations/` — never edit an applied migration.

## Rules
* Business validation lives in `packages/shared` and is enforced server-side; the UI only mirrors it.
* Every new endpoint needs a permission check (`requirePerm`) and an `audit()` call for state changes.
* User-facing strings must exist in FR, EN and Kirundi (`apps/web/src/i18n`).
* Never commit secrets, real customer data or uploaded documents.
