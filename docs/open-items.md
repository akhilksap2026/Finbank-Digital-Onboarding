# Open items (need FinBank input before go-live)

| # | Item | Owner | Current state in the build |
|---|---|---|---|
| 1 | **Flexcube 14.0 gateway XSDs / field mapping** (customer category, account class codes, mandatory UDFs, branch codes, MSGID rules, gateway URL & user) | IT / Core banking | SOAP envelopes built to the standard `CREATECUSTOMER_IOPK_REQ` / `CREATECUSTACC_IOPK_REQ` structure; validated against mock only. Account classes per product are configurable. |
| 2 | **AML / sanctions vendor** (UN, OFAC, EU, local lists; API contract) | Compliance | Pluggable adapter; `mock` flags names containing SANCTION/MATCH/MINISTRE and declared PEPs. `http` adapter is generic. |
| 3 | **SMS provider for OTP** | Digital / IT | OTP is a checkbox placeholder. |
| 4 | **Native Kirundi review** of all UI strings and the RGO/Kirundi PDF text | Marketing / CASA | First-draft Kirundi; dashboard widget titles and some workspace action labels are still English/French only. |
| 5 | **BRB Circular 01/LBC-FT/2026** full text (document list, risk classes, retention) — the published PDF is a scan | Compliance | Checklist, risk weights and thresholds are configurable and seeded with reasonable defaults. |
| 6 | **PEP senior-management approval rule** (Law 1/02 art. 5 as amended by Law 1/08 of 2025): is Compliance enough or must MD/CEO sign every PEP? | Compliance / MD | PEP → Compliance; MD only for sanctions or score ≥ 80. One routing-rule change if MD sign-off is required. |
| 7 | **Retention period** and purge/legal-hold policy (Law 1/03 of 2026 + BRB) | Compliance / Legal | `RETENTION_YEARS` setting only; **no automatic purge job yet**. |
| 8 | Malware scanning of uploads (ClamAV/ICAP) | IT Security | Magic-number check + size limit only. |
| 9 | Official palette confirmation (navy/orange QMS vs purple/yellow earlier prototype) and clean blank forms | Marketing | QMS navy/orange used; forms redrawn from scans — please proof-read the PDF pack. |
| 10 | TLS reverse proxy, AD group names, device MDM | IT | `.env.example` contains placeholder group names. |
| 11 | Notifications to customers/staff (SMS/e-mail on status changes) | Digital | Not implemented (no provider). |
| 12 | Docker image build not yet executed (no Docker on the build box); CI covers install/typecheck/test/build | IT | App verified with the same `npm run build` + Node 20 + Postgres 17 natively. |
