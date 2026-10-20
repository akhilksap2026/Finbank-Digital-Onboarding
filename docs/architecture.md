# FinBank Burundi — Digital Account Opening: Architecture

Staff-operated account opening for branch counters (web) and field tablets (installable PWA, offline-first).
It replaces "project A" (customer self-service prototype). Every bug listed in `assessment.md §5` is addressed (table at the end).

## 1. Components
```
 Tablet / browser (React 18 PWA, FR/EN/RN)          On-prem Docker host
 ┌───────────────────────────────┐   HTTPS   ┌────────────────────────────────────┐
 │ UI (role nav, journey wizard)  │◀────────▶│ app: Node 20 + Express 4 (TypeScript)│
 │ IndexedDB: AES-GCM drafts+queue│  /api     │  ├ auth (AD/LDAP | mock) + JWT       │──▶ Active Directory (LDAPS)
 │ key = PBKDF2(PIN) in memory    │           │  ├ RBAC + department workspaces      │
 │ service worker (Workbox)       │           │  ├ workflow / routing / risk / SLA   │──▶ Flexcube 14.0 SOAP gateway
 └───────────────────────────────┘           │  ├ AML adapter (mock | http)         │──▶ AML vendor API (TBD)
                                              │  ├ PDF pack renderer (pdfkit, vector)│
                                              │  ├ encrypted document store (AES-GCM)│──▶ /data/docs volume
                                              │  └ serves web/dist (SPA)             │
                                              └───────────────┬────────────────────┘
                                                              ▼
                                                    Postgres 17 (pgdata volume)
```
Code layout: `packages/shared/` (domain model + validation used by both sides), `apps/api/` (server), `apps/web/` (PWA), `scripts/` (screenshots, sample PDFs).

## 2. Domain & workflow
* **Application kinds:** new customer, additional account for an existing CIF, KYC update. Customer types: individual, joint (repeated holder blocks), corporate (directors, signatories, beneficial owners, mandatees, FinConnect operators). Akabirya = minor + guardian.
* **States:** `DRAFT → PENDING_BRANCH_HEAD → [PENDING_OPERATIONS] → [PENDING_COMPLIANCE] → [PENDING_MD] → ACCOUNT_OPENED`, with `RETURNED` (back to maker, editable, resubmittable), `REJECTED`, `FALLBACK_MANUAL`.
* **Submit gate** (server-authoritative, same code as client): `shared/validation.ts` (formats +257 / NIF 10 digits / e-mail, age & minors, ID expiry, PEP details, UBO ≤ 100 %, signing rule, orphan party IDs in mandates/operators, FinConnect consistency, consent, referral + staff code, staff ID-verified checkbox) **plus** the configurable document checklist per product × customer type × party role; the signed-form scan is mandatory.
* **On submit:** AML screening of every party → risk score (`services/risk.ts`, weights/thresholds editable by Risk) → approval chain from `routing_rules` (always branch head; PEP / high risk / AML hit → Compliance; exceptions / corporate → Operations; sanctions or score ≥ 80 → MD/CEO) → compliance cases (AML hit, EDD) opened as tasks; SLA due time per step.
* **Decisions:** only the role whose step it is; branch head limited to own branch; **maker-checker** (maker can never approve); comment mandatory for return/reject; compliance cannot approve while its cases are open.
* **Core banking:** final approval calls Flexcube `FCUBSCustomerService.CreateCustomer` then `FCUBSAccService.CreateCustAcc` (existing CIF skips the first). Idempotent: MSGID derived from the application ref, unique success key in `integration_log`. On failure → `FALLBACK_MANUAL`, an Operations `core_fallback` task (prefilled record in the PDF) and an IT `integration_error` task; Ops enters CIF/account manually or retries.
* **After opening:** customer row, service tasks routed to owning teams (PesaFlash/Ecocash/Internet/FinConnect → Digital; cheque book → Cards; e-statement → Operations), document QA task, KYC next-review date (daily job raises `kyc_refresh` tasks).

## 3. Roles, dashboards and workspaces
RBAC map in `apps/api/src/rbac.ts`, enforced on every route (`requirePerm`, row-level `loadForUser`). The UI only hides what the API already refuses.

| Role | Dashboard | Workspace / pages |
|---|---|---|
| clerk / field_agent | drafts, submitted, returned, sync status (+GPS, offline queue for agents) | journey, my applications |
| branch_head | branch pipeline, pending approvals, SLA breaches, staff productivity, referral stats | approvals |
| operations | queue, Flexcube failures/fallbacks, service-request tracking | Operations/CASA: manual opening, retry, document QA |
| compliance | AML hits, PEP/high risk, EDD, KYC expiry | case management, EDD, STR flag to CRF/FIU, KYC refresh |
| md | bank-wide KPIs, exceptions awaiting decision, branch comparison, product mix | approvals |
| auditor | read-only trail | audit trail search/CSV export + chain verification, file sampling, findings |
| admin | users/roles, products, documents, rules, integration health | Administration |
| it | integration health, devices, errors | device registry (lock / wipe / unlock), logs, job retries, config |
| digital, cards, customer_service, risk | own queues + KPIs | own workspace; CS status lookup; Risk model editor |

Department definitions (task types, actions with target status and required inputs, SLA hours) live in `DEPARTMENTS`.

## 4. Security & data protection (Law 1/03 of 2026)
* **AuthN:** AD over LDAP(S) — service bind, user bind, `memberOf` group → role map (`LDAP_GROUP_ROLE_MAP`); users must also be provisioned (branch, staff code). JWT (default 10 h). Login throttling. Mock mode for development only (warns in production).
* **Device:** 6-digit PIN set per user per device; PBKDF2-SHA256 (310 k) → AES-256-GCM key kept **only in memory**. Reload, inactivity (5 min) or "Lock" ⇒ key dropped; 5 wrong PINs ⇒ local wipe. IT can lock/wipe a device remotely: the command is delivered on the next sync/login (423 on login).
* **At rest:** drafts and sync queue encrypted in IndexedDB; uploaded documents AES-256-GCM on the server (`STORAGE_ENCRYPTION_KEY`), SHA-256 recorded, magic-number check on upload, size limit. No PII in localStorage.
* **Audit:** every read/write/decision/login/export → `audit_events`, SHA-256 hash chain (canonical JSON, advisory-locked), DB triggers forbid UPDATE/DELETE/TRUNCATE; `/api/audit/verify` recomputes the chain.
* **Consent:** mandatory data-processing consent, optional marketing consent, RGO acknowledgement, all captured and printed.
* Helmet CSP, production refuses default secrets.

## 5. Offline sync
Client keeps a queue of `create`/`update` ops keyed by `clientUuid` (updates collapse into a pending create). `POST /api/sync` is idempotent on `clientUuid`, applies optimistic-version patches, records device heartbeat (pending items, GPS) and returns `lock`/`wipe` commands. Documents and submission require connectivity (by design: scans are large and submission triggers AML/Flexcube).

## 6. PDF pack
`apps/api/src/pdf/` redraws the official FinBank forms as vector layouts (no clean blanks existed): specimen card, account opening form(s) with continuation pages beyond 4 directors/signatories, RGO acknowledgement, PesaFlash, mandatee letter, FinConnect ×2, cheque-book request, and a KYC/LBC-FT annex (DOB, ID type/expiry, PEP, UBOs, source of wealth, referral + staff code, AML/risk, approvals). Every page always prints; unrequested services are stamped "NOT REQUESTED / NON DEMANDÉ". Obvious form errors fixed (e.g. 4th signatory label).

## 7. Assessment bug → fix
| Project A issue | Fix |
|---|---|
| Docs step completes with any one document | per-product/party checklist; server blocks submit on each missing item |
| Corporate profile used individual fields | entity-specific validation |
| `passport` missing | full ID type list incl. passport, refugee card, birth certificate |
| Services/Authority always complete; operators without FinConnect; orphan IDs | explicit validation rules (tested) |
| Fake completeness % | real issue list from shared validator |
| No format/age/expiry checks | `shared/validation.ts` (tested) |
| Joint "complete" manual flag | each holder validated as a full party |
| `latest` deps, UI not served, `rejectUnauthorized:false`, Manus hosting | exact pins + lockfile, API serves `web/dist`, on-prem Docker |
| PII in localStorage | encrypted IndexedDB, PIN-derived key, wipe |
| No auth / IDOR on PDFs | AD login, JWT, RBAC + row-level checks on every route |
| Hard-coded audit actor, mutable trail | real actor, hash chain, immutable table |
| No rate limiting / encryption at rest | login throttle, AES-GCM documents (malware scanning: see OPEN_ITEMS) |
| No screening / risk / EDD / periodic review | AML adapter, risk model, EDD cases, KYC refresh job |
