# Official FinBank Forms: Analysis & Data-Model Mapping
Sources:
- **Form 1** = 01M5C0Q49DF9W2FBV9TPEY6YCC.pdf, 9 pages: the **Corporate / legal-entity pack**.
- **Form 2** = 01M5C0Q48FPR9XGSX4PRT3TM93.pdf, 8 pages: the **Individual & Joint pack**.

Both are scanned A4 PDFs (the PDFium producer left no text layer). I rendered them with pdftoppm and read them with tesseract fra+eng plus visual checks.

Files: page images are in `/workspace/projects/forms/` (`formN-P.png` at 80 dpi, `hi-formN-P.png` at 200 dpi). Raw OCR is in `forms/ocr/`. The OCR is noisy, so the labels below were checked against the images for the main pages (F1 p2–3, F2 p5).

## FORM 1: Corporate pack (FR/EN bilingual; p4 FR/Kirundi)
| Page | Document | Languages |
|---|---|---|
| 1 | **Specimens de signatures et pouvoirs** (signature card): Intitulé; 4 blocks A–D, each with (photo) + "Nom et Signature du Titulaire" / "du Mandataire"; POUVOIRS: ☐ Séparément ☐ Conjointement (à préciser); SIGNATURES AUTORISEES; Date | FR |
| 2 | **Formulaire d'Ouverture de Compte / Account Opening Form** (orange/navy header, logo "More than a Bank, a Partner") | FR/EN |
| 3 | Introducer certificate, Signature mandate, Declaration, 4 signatories, Documents required, **Bank use only** | FR/EN |
| 4 | Acknowledgement of the **Règlement Général des Opérations**: "Lu et Approuvé", Numéro de Compte, Date, Nom-Prénom & Signature | FR + Kirundi |
| 5 | **Application form "PESAFLASH"** | EN/FR |
| 6 | **Letter "Nomination d'un mandataire"** (to the ADG of Finbank S.A.) | FR |
| 7–8 | **FINCONNECT Activation Form – COMPANY** | EN |
| 9 | **Cheque book request** ×2 slips (20 or 40 formules) with "Partie réservée à la banque" | FR |

### F1 p2 fields (exact labels)
- Compte N° / Account No. (boxes); Date; Agence / Branch
- "Je désire / Nous désirons ouvrir un (des) compte(s)… / I or we request you to open…"
- Type de Compte / Account Type: ☐ Compte Courant / Current Account ☐ Compte épargne / Savings Account
- Monnaie / Currency: ☐ BIF ☐ USD ☐ EUR ☐ Autre (précisez) / Other (Specify)
- Forme juridique / Legal Status, with these options:
  - Individu / Individual
  - Entreprise individuelle / Sole Proprietor
  - S.A.R.L / Limited Company
  - Entité gouvernementale / Government Entity
  - Société en nom collectif / Partnership
  - Société mixte / Semi-Public Company
  - Société publique / Public Limited Liability Company
  - ONG/Organismes internationaux / NGO/International Organisations
  - Société/Association/Club/Fidéicommis / Society/Association/Club/Trust
  - Autre (spécifier) / Other (Specify)
- Registre de Commerce / Company Registration Number
- Nom de la Société ou de l'Organisation / Company or Organization Name
- Date d'Incorporation ou d'Enregistrement / Date of Incorporation or Registration
- Boîte Postale / Postal Address; Ville / Town
- N° de Téléphone / Telephone No.; N° du cellulaire / Mobile No.; N° du Fax / Fax No.
- Adresse électronique / E-mail address
- Adresse Physique de la Société (Lot/Immeuble/Avenue/Rue) / Full Physical Address of the business (Plot/Building/Road/Street)
- Site Web / Website Address
- **Autres comptes actuellement détenus à la Finbank Burundi ou dans d'autres banques / Other accounts currently held…**: table with 3 rows × (Intitulé du Compte / Account Name, Banque & Agence / Bank Name & Branch, Type de Compte, N° de compte)
- **Coordonnées des Administrateurs / Partenaires / Fidéicommissaires / Membres / Propriétaires / Details of Directors / Partners / Trustees / Members / Proprietor**: 4 rows × (Nom et Prénoms / First & Last Name, N° de Téléphone / Telephone No.)
- **FACILITES DU COMPTE / ACCOUNT FACILITIES**: ☐ Chéquier / Cheque Book ☐ Mobile Banking ☐ E-statement ☐ Internet Banking ☐ Carnet Ordre de Paiement / Transfer Order Booklet; ☐ E-mail address for E-statement
- **Parrain N°1 / Introducer 1**: Nom & Prénoms; Raison sociale et Fonction / Company Name & Designation; Adresse Postale et Physique (N° de bloc/Rue/Avenue/Quartier); N° de compte à la Finbank Burundi; N° de Téléphone; N° de téléphone au Bureau / Office No.; N° de cellulaire / Mobile No.

### F1 p3 fields
- **Attestation du Parrain / Certificate by Introducer**: text "known for ___ years" (years known); Date; Signature; Signature vérifiée par (Réservé à la Banque)
- **SIGNATURE DU MANDATAIRE / SIGNATURE MANDATE FORM**: Signing instructions ☐ Seul / Singly ☐ Conjointement / Jointly ☐ L'un ou l'autre / Either ☐ Autre (précisez) / Other; "Autres instructions / Other Signing Instructions" (free text)
- Declaration paragraph (FR+EN): opening at the bank's discretion; indemnity; account may be closed on 30 days' notice; General T&C; information is true
- **1er–4ème Signataire / 1st–4th Signatory**: Nom & Prénoms; Titre ou Fonction / Designation or Title; Signature. (The 4th is mislabelled "3rd Signatory" in EN, a typo on the form.)
- **DOCUMENTS EXIGES / DOCUMENTS REQUIRED** (copies certified by Company Secretary or Branch Official):
  - 2 passport photos of all authorised signatories
  - ID/Passport copy of all signatories
  - Statuts / Memorandum & Articles or by-laws
  - Certificate of incorporation / business registration
  - NIF
  - Registre de Commerce
  - Board resolution / committee extract signed by Chairman & Secretary
  - Address confirmation of signatories, directors, partners, trustees, proprietor (utility bill* or company letter)
  - Partnership deed
  - Business address confirmation (utility bill* / tenancy agreement)
  - *Water, electricity or telephone receipt
- **RESERVE A LA BANQUE UNIQUEMENT / FOR BANK USE ONLY**:
  - Valid ID documents obtained and authenticated: Oui/Non
  - Reference verified by (Name)
  - Exceptions approved by
  - AML check done: Oui/Non
  - Autorisation du Directeur / Manager's approval
  - Account opened by (Name) + Signature
  - Authorized by (Name) + Signature
  - Additional comments
  - Exceptions (Give reasons)
  - Autorisation du Directeur d'agence / Manager's approval

### F1 p5 PesaFlash
Fields:
- Branch/Agence
- Name/Nom
- Mobile Number
- Account Number
- Ecocash Agent Y/N + Ecocash Agent Code
- Language ☐French ☐Kirundi ☐English
- Email
- "Interested in Ecocash Banking Services?" Y/N + Econet/Leo number if different

Signature blocks: Declaration (MPIN by SMS; links all accounts to the customer number and mobile); Date; Signature; Customer Service Officer.

### F1 p6 Mandataire letter
Fields:
- Nom du client, Adresse, Tél, Adresse Électronique
- Je/Nous … désigne
- Table: Intitulé de compte, Numéro de compte
- Table: Nom du/des mandataire(s), Numéro de la pièce d'identité, Montant limite, Sans limite (Oui/Non); "Si Oui, la limite est de BIF/USD/EUR"
- Powers: {} Retrait d'espèces {} Demande de solde {} Retrait de carnet de chèques {} Historique du compte; Tout autre transaction (préciser)
- Attachment instruction: ID/passport + 2 photos per mandatee

Signature blocks: Declaration; Signature du titulaire.

### F1 p7–8 FinConnect Company
Fields:
- Date
- I. Customer details: Name, Address, Contact person, Designation
- Channel for login & OTP: Mobile / E-mail / Both
- II. Operator details: Name & Designation, Account Number 1–3, Email, Téléphone
- III. Access parameters table per operator × account:
  - Roles: Admin / Operator / Viewer
  - Access type: initiate / approve / view, per the checkbox columns
  - Limit Amount (per transaction and/or per day)
- IV. Acceptance of T&C: Name & Signature

Bank use: For Bank Use Only (Created by / Approved by: Staff name, Signature, Date).

### F1 p9 Cheque book
Fields: "Par le débit de mon compte… Carnet(s) de chèque de 20 ou 40 formules". Bank part: Vérifié signature et pouvoir, Intitulé du compte, Numéro de compte, Signature et Date.

## FORM 2: Individual & Joint pack (FR/Kirundi on the main form; EN/FR elsewhere)
| Page | Document |
|---|---|
| 1 | Specimens de signatures et pouvoirs (same as F1 p1) |
| 2 | PesaFlash application (same as F1 p5) |
| 3–4 | **FINCONNECT Activation Form – INDIVIDUAL & JOINT ACCOUNTS**: Customer details (Surname, Name, Email); **"Know Your Customer"** (Avenue, City, Profession, Mobile No); OTP channel; Operators; Access parameters; T&C "Signed"; **For Joint Accounts Only**: holders authorise registration (table: #, Name, Phone number, Signature, Date); Bank use Created/Approved by |
| 5 | **Formulaire d'Ouverture de Compte Individuel / Urwandiko rwuzuzwa mu kwuguruza ikonte y'umuntu umwe** (grey header) |
| 6 | Règlement Général acknowledgement (FR + Kirundi) |
| 7 | Nomination d'un mandataire letter |
| 8 | Cheque book request ×2 |

### F2 p5 fields (FR / Kirundi exact)
- Compte N° / N° y'Ikonte; Date / Igenekerezo; Nom / Izina; Agence / Ishami; Nom de compte / Izina ry'ikonte
- Type de compte / Ubwoko bw'ikonte: ☐ Compte Courant / Ikonte isanzwe ☐ Compte épargne / Ikonte y'ukuzigama ☐ **Akabirya** (a third product, see Q1)
- Monnaie / Amafaranga akoreshwa: ☐ BIF ☐ USD ☐ EUR
- **Identification du Client / Ibiranga Umunywanyi**:
  - Résidence / Aho uba; Quartier / Karitiye; Avenue / Ibarabara; Ville / Igisagara; B.P / Agasandugu ka Posita
  - Téléphone / Terefone; E-mail / Imeyire
  - Nationalité / Ubwenegihugu; Occupation / Akazi ukora; Profession / Umwuga
  - N° d'identité / N° ya Karangamuntu
  - Self-employed? / Wikorera utwawe? Yes/Ego No/Oya
  - Job title / Ico ukora; Annual income / Ayo winjiza ku mwaka
- **Autres comptes… / Other accounts currently held**: 3 rows × (Intitulé / Uko ikonte yitwa, Banque & Agence / Ibanki n'ishami ryayo, Type, N° de compte / Inomero y'ikonte)
- **Source de revenue / Ahava amafaranga**, with Amount (expected annual) per source: ☐ Salaries / Umushahara ☐ Business income / Urudandazwa ☐ Sale of property / Ukugurisha ibitimuka ☐ Others / Ibindi
- **Facilités du compte / Ibikoreshwa kw'ikonte**: ☐ Chéquier / Agatabu k'amasheki ☐ PESA Flash ☐ E-statement / Ubuh. bwa none ☐ Ecocash; E-mail address for E-statement
- Signature du client / Umukono w'Umunywanyi | Signature vérifiée par / Umukono wasuzumwe na (Réservé à la Banque)
- **Documents exigés / Inzandiko zitegerezwa**: 2 passport photos of all authorised signatories; copy of ID/Passport; Attestation de résidence (for foreigners)
- **Réservé à la banque / Aha musi huzuzwa n'ibanki gusa**: Valid & authenticated ID Oui/Non; Compte ouvert par (Nom) + Signature; Autorisé par (Nom) + Signature

Not on the individual form, though the prototype has them: date/place of birth, sex, marital status, ID type/expiry, NIF, employer details, PEP, source of wealth. **The form also has no joint-holder section beyond the specimen card and FinConnect joint table. Joint holders are presumably handled with one form per holder (Q2).**

## Signature, stamp and bank-use summary
- Customer signatures:
  - specimen card (4 photo+signature blocks, both packs)
  - main form (1 for individual; 4 signatories for corporate)
  - introducer signature (corporate)
  - Règlement Général "Lu et approuvé"
  - PesaFlash, mandataire letter, FinConnect T&C (+ joint table), cheque request
- Bank: signature verified by; account opened by / authorised by; reference verified by; exceptions approved by; AML check; manager's approval / branch manager's approval; FinConnect created/approved; PesaFlash CSO; cheque "vérifié signature et pouvoir".
- No explicit company-stamp box exists; documents are "certified by Company Secretary or Branch Official".

## Gap mapping: form vs prototype (`src/types/domain.ts`)
### On the forms, missing in the app
| Form field | Form |
|---|---|
| Account type **Akabirya** | F2 |
| Currency "Autre (précisez)" | F1 |
| Legal-status options Semi-Public, Public LLC, NGO/International Org, Society/Club/Trust, Other; "Individual" | F1 (app has 6 values) |
| Postal address (BP / Agasandugu), Fax No. | F1, F2 |
| Residence / "Aho uba" as a distinct line (the app has address line, neighbourhood, city, commune, province) | F2 |
| Other accounts held at Finbank/other banks (3-row table) | F1, F2 |
| Income source **with amount per source** (the app has a list and annual income only) | F2 |
| Directors/partners table limited to name + phone (the app has richer data, fine) | F1 |
| **Introducer/Parrain** block + certificate (years known, signature, verification) | F1 (Interbank has the same concept). Maps to the Ops/CASA "referral source" request |
| Signing instruction "Other" + free-text other instructions | F1 |
| 1st–4th signatory name/title for the declaration | F1 |
| Mandataire letter: ID number per mandatee, "Sans limite" flag, powers list (cash withdrawal, balance enquiry, cheque book collection, account history, other) | F1/F2 (the app has free `powers[]`) |
| PesaFlash: Ecocash agent Y/N + agent code, preferred language, Econet/Leo number | F1/F2 |
| FinConnect: contact person + designation, up to 3 accounts per operator, operator email/phone, OTP channel, joint-holder authorisation table | F1/F2 |
| Cheque book request: number of books | p9/p8 |
| Règlement Général acknowledgement (date, signature) | both |
| Bank-use: ID authenticated Y/N, reference verified by, exceptions approved by + reasons, AML check Y/N, manager/branch-manager approval, opened by / authorised by, additional comments, signature verified by | both |
| Specimen card with **photo** per signer/mandatee and powers (separately/jointly) | both |
| Required document "Attestation de résidence (foreigners)", partnership deed, business address confirmation | both |

### In the app, not on the forms
- Individual: sex, date/place of birth, marital status, NIF, ID type & expiry, employer name/phone/address, monthly income, income currency, source of wealth, relationship purpose, expected monthly inflow/outflow, transaction countries, preferred contact channel, OTP verified.
- Address commune/province/country (not on the forms, but needed for BRB/AML).
- Entity: account name separate from legal name, operating permit, business activity, share capital, annual turnover.
- Parties: ownership %, voting rights, beneficial-owner role, nationality, ID number.
- Declarations: PEP + details, acting for self, ownership confirmation; consents / T&C version.
- Workflow, risk, sanctions, OCR, audit, PDF artefacts.

These are mostly KYC/AML fields that BRB rules require (beneficial owner, PEP, sanctions) but the paper forms lack. **Decision needed: either keep them in the app with an annex page/KYC sheet, or drop them because the PDF must "match exactly" (Q3).**

### New fields requested (not on the forms either)
- Referral source (dropdown) + Staff code if referral = staff. Placement on the PDF is to be agreed (Q4).
- Existing-customer flows: CIF number lookup, KYC update and additional account. The forms have no "KYC update" variant (Q5).

## Open questions
1. What is **"Akabirya"** (F2 account type)? Is it a product (kids/youth savings?), and does it need its own fields such as minor or guardian details?
2. **Joint accounts:** is one Individual form filled per holder, plus a shared specimen card? Is there an official joint form we haven't received?
3. "Match exactly" vs KYC extras: may we add an **annex page** (KYC/AML sheet: DOB, ID expiry, PEP, beneficial owners, source of wealth, risk rating, referral/staff code), or must the PDF reproduce only the existing pages? Can we get the **original vector source files** (Word/InDesign) or the latest blank PDFs, since the scans are skewed?
4. Where should **referral source / staff code** print: the introducer area, the bank-use block, or the annex? What is the list of referral sources?
5. Is there an official form for **KYC update / additional account** for existing customers, or should we design one?
6. The corporate form has only 4 director rows and 4 signatories. Do we need overflow continuation pages?
7. Should the PesaFlash, FinConnect, Mandataire and cheque-book pages print only when that service is requested? (They go to the owning teams separately.)
8. Is the Individual form Kirundi-only, given that the corporate one is FR/EN? Should the generated PDF keep each form's fixed languages regardless of the UI language?
9. The scans have small differences: F2 FinConnect has a "Know Your Customer" block and F1 has none, and F1's EN label says "3rd" for the 4th signatory. Should we reproduce them as-is, or correct the typos?
