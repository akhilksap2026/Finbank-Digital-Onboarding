# FINBANK Digital Account Opening: Assessment of the Two Archives
Assessment only. No project code was changed.
- A = 01M5BZYPB26GZ06EDV2G9CXPKD.zip, unpacked to /workspace/projects/a
- B = 01M5BZYPKH0MY6BERPSJYJ4FJ7.zip, unpacked to /workspace/projects/b

## 1. Which archive is the latest: **A**
- Both archives give every file the same mtime of 1979-12-31 (the zip default). Neither has a .git folder or git history. Both have package version 0.1.0. So dates and versions tell us nothing.
- A contains all of B plus more:
  - Files only in A: `PRD_Burundi_Digital_Account_Opening.md/.pdf` (PRD v1.0, dated 15 Oct 2026), `Email_Operations_CASA_Flow_Validation.md` (asks for feedback by 19 Oct 2026), `public/assets/finbank-logo.png`.
  - A's TODO.md has an extra completed section: "FinBank visual workplace redesign — completed".
  - A's plan.md has an extra addendum: "FinBank SaaS workbench redesign".
- B is the older "Kira Bank" placeholder branding: a dummyimage logo, the README title "Kira Bank" and the storage key `kira-bank-...`. A rebrands to FinBank (purple #312783, yellow #FDC808, navy #1D2F41) and adds the `FinbankLogo` component and tablet CSS (styles.css is 62 KB in A vs 49 KB in B).
- Functional logic is the same. App.tsx, ReviewConsole, Dashboard, pdf.ts and translations differ only in branding and layout. The server, the migration and the domain types are identical.

## 2. Tech stack, structure, how to run
- Front end: React (version "latest", so not pinned), TypeScript, Vite, lucide-react icons, jsPDF. It is a single-page app with no router. Navigation is driven by state in App.tsx (56 KB, written as one-line JSX). Languages: EN and FR (src/i18n/translations.ts). There is no Kirundi.
- Back end: server/index.mjs, an Express 5 API on port 3001, with MySQL through mysql2 (DATABASE_URL). Object storage uses presigned URLs from `MANUS_API_URL` / `MANUS_API_KEY`, which ties it to the Manus hosting platform. The prototype was built and hosted on Manus.
- Structure: src/{App.tsx, features/(DocumentCapture, ReviewConsole, DashboardView), components/ui.tsx, mocks/(prototype.ts, backend.ts = localStorage repository), services/archiveApi.ts, utils/pdf.ts, types/domain.ts}, server/, scripts/migrate.mjs, Dockerfile.
- How to run: `pnpm install`, then `pnpm dev` (Vite on :3000, with /api proxied to :3001). Run `DATABASE_URL=... pnpm migrate && pnpm dev:api` alongside it. The PDF archive needs the Manus storage credentials.
- Dockerfile: runs `pnpm build`, then `migrate` + `node server/index.mjs`. **Bug:** the server never serves `dist/` (there is no express.static), so the container only exposes the API. Also, the Dockerfile sets PORT=3000 but there is no proxy in front.

## 3. The journey today
Screens: Welcome (choose language EN/FR, Start, links to Dashboards and Operations) → an 11-step stepper with a live "dossier" side rail and a completion % → Submission confirmation. The Operations Review Console and the Role Dashboards are separate screens.

Steps (from getSteps / isStepComplete):
1. **Account**
   - Customer type: Individual, Joint, or Corporate (company/NGO/association).
   - Account type: current or savings. Currency: BIF, USD or EUR.
   - Account name, branch (free text, demo "Bujumbura Centre"), account purpose.
   - Required to continue: name, purpose, branch.
2. **Contact**
   - Mobile, e-mail, preferred channel (mobile/email/both).
   - OTP is **simulated**: a "Sample OTP verified" button sets otpVerified and the status CONTACT_VERIFIED.
   - Required: mobile, e-mail, OTP verified.
3. **Identity**
   - Individual: first/last name, sex, DOB, place of birth, nationality, marital status, NIF, ID type (national ID/passport), ID number, expiry. Required: name, DOB, ID number, expiry.
   - Corporate: legal name, account name, legal form (limited company, sole proprietor, partnership, NGO/association, trust, government entity), RC registration number, incorporation date, NIF, operating permit, business activity, website, phone/mobile/email, share capital, annual turnover. Required: legal name, registration number, NIF, incorporation date, activity.
4. **Address**: line, quarter/neighbourhood (colline), city, commune, province, country. All fields required.
5. **Profile**: occupation, job title, self-employed flag, employer name/phone/address, monthly/annual income and currency, income sources, source of funds, source of wealth, relationship purpose, expected monthly inflow/outflow, transaction countries.
6. **Ownership** (joint and corporate only)
   - People: holder, director, general manager, signatory, beneficial owner, representative, with nationality, phone, email, ID, % ownership, voting rights, and completion status (invited/started/complete).
   - Joint: needs at least 2 holders, all complete.
   - Corporate: needs at least 1 director, at least 1 beneficial owner, and the ownership-confirmed box.
7. **Declarations**: acting for self, PEP (plus details), accuracy confirmation.
8. **Services**: cheque book (20 or 40 leaves), mobile banking, PesaFlash, Ecocash, e-statement, Internet banking, transfer booklet, FinConnect.
9. **Authority**: mandates (party, powers, limit, signing rule joint/separate/either) and FinConnect operators (admin/operator/viewer, initiate/approve, limit per transaction/per day).
10. **Documents** (DocumentCapture)
    - Camera or upload. Quality check and OCR are **simulated**, with editable "corrected" values and a mock hash.
    - Required list for individuals: national ID, passport photo, proof of address.
    - Required list for corporates: registration certificate, articles, board resolution, NIF certificate. Operating permit and mandate proof are optional.
11. **Review**: summary, then terms + privacy + accuracy checkboxes, then Generate PDF (A4 individual or corporate form, jsPDF), download, save draft, and "Send for bank review" (status READY_FOR_BANK_REVIEW).

Workflow statuses: DRAFT → CONTACT_VERIFIED → IDENTITY_CAPTURED → DOCUMENTS_PENDING → KYC_IN_REVIEW → ENHANCED_DUE_DILIGENCE → OPERATIONS_REVIEW → READY_FOR_BANK_REVIEW → APPROVED, or RETURNED_FOR_CORRECTION.
- Risk: low/medium/high plus a score.
- Outcomes: clear / pep / potential_match / missing_documents / high_risk.

Roles:
- The dashboards cover customer, clerk (maker), branch head, managing director and auditor.
- The Review Console has a queue, identity, screening, ownership, documents, PDF archive, audit trail and a decision panel. **All decisions are local simulations.**
- There is no login and no role enforcement. Anyone can open any screen.

Integrations:
- **None are real.** OTP, OCR/ID verification, sanctions/PEP screening, core banking/CIF, channel provisioning (PesaFlash, Ecocash, FinConnect, IB), e-signature, fees: all are mocked or not present.
- The only real backend function is archiving the PDF: MySQL metadata, a SHA-256 checksum, object storage, and audit events for archive/download.

## 4. Differences between A and B
Only branding and responsiveness differ:
- FinBank logo, colours and PDF header "FINBANK S.A.".
- Tablet breakpoints: 821–1100px goes to 2 columns. At ≤820px the step rail becomes a horizontal scroll, the dossier rail is hidden, reviewer panels stack, and touch targets are 44px.
- A has the extra PRD and the Ops/CASA validation e-mail.
- No difference in business logic.

## 5. Gaps, bugs, and security/compliance concerns
**Design mismatch with the intended use.** The app is written as **customer self-service** ("Your information stays in your control", "Your application"). Akhil wants **staff-assisted** opening. So it lacks:
- staff login, branch/user context, and the customer's presence or physical ID check by staff
- a duplicate/existing-customer (CIF) lookup
- wet or tablet signature capture, plus photo/biometric capture

**Bugs and logic issues:**
- The Documents step completes once **any one** document is uploaded, even though a required list exists. Submit is enabled the same way.
- The corporate Profile check uses `individual.sourceOfFunds` and `individual.expectedMonthlyInflow` instead of entity fields.
- `passport` is missing from the `documentTypes` array, while the filter references it. Passport holders cannot pick it.
- Services and Authority always count as complete. FinConnect operators and mandates are not validated (for example, at least one signatory, limits, no orphan party IDs). Operators can be added without FinConnect selected.
- The Review Console's "completeness %" is a made-up formula (35 + docs×20 + 15).
- There is no format validation: NIF, phone +257, e-mail, ID number, ID expiry in the future, minimum age or minors.
- The joint-holder "complete" flag is set manually. The holders' full KYC is not captured.
- Dependencies are "latest" (not reproducible). The Docker image does not serve the UI. The DB uses SSL with `rejectUnauthorized:false`. Hosting is tied to Manus.
- All PII, including document images as data URLs, is stored in browser **localStorage**, so it persists on shared branch tablets.

**Security:**
- There is no authentication or authorisation on any API. Anyone can download any PDF by its ID (an IDOR issue).
- The audit actor is the hard-coded string "Prototype applicant". The audit trail is client-side and editable. The DB audit table can be updated (it is not immutable).
- No CSRF/rate limiting, no malware scan of uploads, no encryption at rest beyond the provider's defaults, no retention/legal hold.

**Compliance (Burundi):** the docs reference BRB-oriented KYC and LBC-FT (Law No. 1/02 of 2008 on AML/CFT and the BRB circulars). But the app does not have:
- real sanctions/PEP screening (UN/OFAC/EU lists)
- a risk-scoring engine, EDD workflow or periodic review triggers
- CTR/STR hooks to the CRF (Burundi's FIU)
- data-protection controls: consent versioning exists in the data model only; there is no DPO process and no data residency decision
- e-signature legal validity under Burundi's electronic transactions law
- maker-checker enforcement

There is no core-banking mapping either. Which core system is used is unknown.

**Tablet-readiness:** A has responsive CSS and a camera input, so it is partly ready. It is not offline-capable (no PWA/service worker). There is no signature pad, no auto-lock or session timeout on shared devices, and no MDM consideration. The 11 long steps are designed for customers rather than for staff speed.

## 6. Questions for the user
1. Which **core banking system** does FinBank run (e.g., T24/Transact, Flexcube, Finacle, Bankers Realm)? Should the app create the CIF and account directly, or only produce a pre-filled record?
2. **Staff-only, or hybrid?** Should customers ever pre-fill (QR/link), or is it only staff on desktops and tablets? Are tablets used in branches, out in the field (agents/sales officers), or both? Is offline needed?
3. **Staff login:** Active Directory / LDAP / SSO? What are the roles and the approval matrix (maker → checker → branch manager → compliance), with limits by risk or product?
4. **Products:** what is the real product catalogue (current, savings, term deposit, salary, student, diaspora, minor accounts, SME), with minimum balances and fees? Should the review step show fees and disclose the tariff?
5. **ID verification:** is there access to a national ID (CNI) database or API? Is biometric/fingerprint or face capture used? Are passports and refugee/resident cards accepted?
6. **Screening:** which tool is used for sanctions/PEP (World-Check, Dow Jones, in-house lists)? What is the risk-rating methodology?
7. **Signature:** wet signature on the printed form, signature pad on the tablet, or e-signature? Does Compliance/Legal accept digital-only?
8. **OTP/SMS provider** (Lumitel/Econet gateway?) and the e-mail service.
9. **Channels:** PesaFlash, Ecocash, FinConnect and IB enrolment. Should they be provisioned automatically or raised as tickets?
10. **Hosting:** on-premises at FinBank or in the cloud? Are there BRB data-residency constraints? Which DB (Oracle, SQL Server, Postgres)?
11. **Languages:** should **Kirundi** be added alongside FR and EN?
12. Did the **Ops/CASA feedback** requested for 19 Oct come back? Please share it.
13. Which **competitors** should we benchmark (e.g., KCB, Ecobank, BANCOBU, Interbank Burundi, BCB, CRDB, Diamond Trust)? Which features of theirs matter most?
14. Should the existing paper forms (the official individual and corporate templates) be matched exactly in the PDF?
15. Existing customers: should we support adding accounts or updating KYC, in addition to new-to-bank?
