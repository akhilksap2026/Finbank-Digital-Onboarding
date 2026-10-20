# Security policy

## Reporting a vulnerability
Do **not** open a public issue. Report privately to FinBank IT Security (security@finbank.bi) or via GitHub private vulnerability reporting on this repository, with steps to reproduce and impact. We aim to acknowledge within 2 business days.

## Handling of data
* The platform processes personal data subject to Law No. 1/03 of 10 March 2026 (data protection) and AML/CFT rules (Law No. 1/02 of 2008 as amended, BRB regulations).
* No production data, documents, credentials or `.env` files may be committed. Use `deploy/.env.example` as the template.
* Secrets (`JWT_SECRET`, `STORAGE_ENCRYPTION_KEY`, LDAP bind password, Flexcube credentials) are supplied via environment only; the server refuses default secrets in production.

## Security controls (summary)
AD/LDAP authentication, server-side RBAC and row-level access, maker-checker, hash-chained immutable audit trail, AES-256-GCM encryption of documents at rest and of tablet data (PIN-derived key), remote device lock/wipe, CSP and login throttling. See `docs/architecture.md` §4.
