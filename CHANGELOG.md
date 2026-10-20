# Changelog
All notable changes to this project are documented here (Keep a Changelog, SemVer).

## [1.0.0] - 2026-10-20
### Added
- Staff-operated account opening PWA (web + tablet, offline-first, FR/EN/Kirundi) and Node/TypeScript API on Postgres 17.
- Journeys for individual, joint, corporate and Akabirya (minor) accounts; additional accounts and KYC updates for existing customers; duplicate-customer search.
- Configurable product catalogue, document checklists and routing rules; risk scoring; AML screening adapter (mock).
- Approval chain branch head → operations/compliance → MD/CEO with maker-checker and SLAs.
- Flexcube 14.0 SOAP adapter (mock) with idempotency and manual-opening fallback.
- Role dashboards and department workspaces (Operations, Compliance, Digital, Cards, Customer service, Risk, IT, Internal audit).
- Vector PDF pack of the official forms plus KYC/AML annex.
- Immutable hash-chained audit trail, encrypted document storage, device lock/wipe.
- Docker deployment, CI, documentation, screenshots and sample PDFs.
