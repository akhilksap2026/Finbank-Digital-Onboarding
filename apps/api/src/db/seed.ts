import { pool, q, one } from './pool'
import { migrate } from './migrate'
import { emptyApplicationData, emptyPerson, type ApplicationData } from '../../../../packages/shared/domain'
import { submit, decide } from '../services/workflow'
import { setMockCoreDown } from '../adapters/flexcube'
import { DEFAULT_RISK } from '../services/risk'
import { kycRefreshJob } from '../routes/misc'

const L = (fr: string, en: string, rn: string) => ({ fr, en, rn })
export async function seedReference() {
  await pool.query(`INSERT INTO branches(code,name,province) VALUES ('001','Siège / Main Branch – Bd de la Liberté','Bujumbura'),('002','Agence Bujumbura Centre','Bujumbura'),('003','Agence Gitega','Gitega'),('004','Agence Ngozi','Ngozi'),('005','Agence Rumonge','Rumonge') ON CONFLICT DO NOTHING`)
  const users = [
    ['clerk1', 'Aline Ndayishimiye', 'clerk', '001', 'FB1021'], ['clerk2', 'Eric Niyonzima', 'clerk', '001', 'FB1022'], ['clerk3', 'Diane Iradukunda', 'clerk', '003', 'FB3011'],
    ['agent1', 'Jean-Bosco Hakizimana', 'field_agent', '001', 'FA0101'], ['bh1', 'Claudine Ntakarutimana', 'branch_head', '001', 'FB1001'], ['bh3', 'Pascal Bizimana', 'branch_head', '003', 'FB3001'],
    ['ops1', 'Fabrice Nshimirimana', 'operations', '001', 'OP0001'], ['comp1', 'Grace Uwimana', 'compliance', '001', 'CO0001'], ['md1', 'Directeur Général', 'md', '001', 'MD0001'],
    ['audit1', 'Olivier Ndikumana', 'auditor', '001', 'IA0001'], ['admin1', 'Admin Système', 'admin', '001', 'AD0001'], ['it1', 'Patrick Irakoze', 'it', '001', 'IT0001'],
    ['digital1', 'Sandrine Kaneza', 'digital', '001', 'DG0001'], ['cards1', 'Moïse Nduwimana', 'cards', '001', 'CC0001'], ['cs1', 'Nadia Ingabire', 'customer_service', '001', 'CS0001'], ['risk1', 'Thierry Manirakiza', 'risk', '001', 'RK0001'],
  ]
  for (const [u, n, r, b, s] of users) await pool.query(`INSERT INTO users(username,display_name,role,branch_code,staff_code,email) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`, [u, n, r, b, s, `${u}@finbank.bi`])
  const P = (code: string, names: any, cat: string, ct: string[], cur: string[], min: any, fee: any, rules: any, cls: string, form: string) => pool.query(`INSERT INTO products(code,names,category,customer_types,currencies,min_opening,monthly_fee,rules,flexcube_account_class,form_type_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (code) DO NOTHING`, [code, names, cat, ct, cur, min, fee, rules, cls, form])
  // Seed catalogue: FinBank published terms (finbank.co.bi, Oct 2026) + proposed products — configurable by Admin.
  await P('CUR', L('Compte courant', 'Current account', 'Ikonte isanzwe'), 'current', ['individual', 'joint', 'corporate'], ['BIF', 'USD', 'EUR'], { BIF: 50000, USD: 50, EUR: 50 }, { BIF: 3000 }, {}, 'CACUR', 'current')
  await P('SAV', L('Compte épargne', 'Savings account', "Ikonte y'ukuzigama"), 'savings', ['individual', 'joint'], ['BIF', 'USD', 'EUR'], { BIF: 25000 }, {}, { withdrawalsPerQuarter: 3 }, 'SASAV', 'savings')
  await P('AKB', L('Akabirya (compte enfant)', 'Akabirya (children/minor account)', 'Akabirya (ikonte y\'abana)'), 'savings', ['individual'], ['BIF'], { BIF: 10000 }, {}, { requiresGuardian: true, maxAge: 17 }, 'SAAKB', 'akabirya')
  await P('SAL', L('Compte salaire', 'Salary account', "Ikonte y'umushahara"), 'current', ['individual'], ['BIF'], { BIF: 0 }, { BIF: 0 }, { requiresEmployer: true }, 'CASAL', 'current')
  await P('WSV', L('Épargne femmes', "Women's savings", "Ukuzigama kw'abagore"), 'savings', ['individual'], ['BIF'], { BIF: 20000 }, {}, { sex: 'F', minAge: 18 }, 'SAWSV', 'savings')
  await P('DIA', L('Compte diaspora', 'Diaspora account', 'Ikonte ya diaspora'), 'current', ['individual', 'joint'], ['BIF', 'USD', 'EUR'], { USD: 50, EUR: 50, BIF: 50000 }, {}, { requiresDiasporaProof: true }, 'CADIA', 'current')
  await P('TDP', L('Dépôt à terme', 'Term deposit', "Ikonte y'igihe"), 'term_deposit', ['individual', 'joint', 'corporate'], ['BIF', 'USD', 'EUR'], { BIF: 1000000 }, {}, { tenorsMonths: [3, 6, 12, 24] }, 'TDSTD', 'savings')
  await P('SME', L('Compte PME / commerçant', 'SME / trader account', "Ikonte y'abadandaza"), 'current', ['individual', 'corporate'], ['BIF', 'USD'], { BIF: 50000 }, { BIF: 5000 }, { requiresTradeRegister: true }, 'CASME', 'current')
  if (!(await one('SELECT 1 FROM document_requirements LIMIT 1'))) {
    const D = (ct: string, pc: string | null, dt: string, role: string | null, lab: any, mandatory = true) => pool.query('INSERT INTO document_requirements(customer_type,product_code,doc_type,per_party_role,mandatory,labels) VALUES($1,$2,$3,$4,$5,$6)', [ct, pc, dt, role, mandatory, lab])
    for (const ct of ['individual', 'joint']) {
      await D(ct, null, 'id_copy', 'holder', L("Copie de la pièce d'identité", 'Copy of ID', 'Ikopi ya karangamuntu'))
      await D(ct, null, 'passport_photo', 'holder', L('Deux photos passeport', 'Two passport photos', 'Amafoto abiri'))
      await D(ct, null, 'proof_of_address', 'holder', L("Preuve d'adresse (attestation de résidence, cahier de ménage, bail, facture REGIDESO < 3 mois)", 'Proof of address (< 3 months)', "Icemezo c'aho uba"))
      await D(ct, null, 'residence_certificate', 'holder', L('Attestation de résidence (étrangers)', 'Residence permit (foreigners)', 'Urwandiko rwo gucumbika (abanyamahanga)'))
      await D(ct, null, 'signed_form_scan', null, L('Formulaire signé numérisé', 'Signed form (scan)', 'Urwandiko rwashizweko umukono'))
    }
    await D('individual', 'AKB', 'birth_certificate', 'holder', L("Extrait d'acte de naissance", 'Birth certificate', "Icemezo c'ivuka"))
    await D('individual', 'AKB', 'guardian_id', 'guardian', L("Pièce d'identité du tuteur", "Guardian's ID", "Karangamuntu y'umurezi"))
    await D('individual', 'SAL', 'salary_letter', 'holder', L("Attestation de service / lettre de l'employeur", 'Employer letter', "Urwandiko rw'umukoresha"))
    await D('individual', 'DIA', 'diaspora_proof', 'holder', L('Preuve de résidence à l\'étranger', 'Proof of residence abroad', 'Icemezo co kuba mu mahanga'))
    await D('individual', 'SME', 'trade_register', null, L('Registre de commerce', 'Trade register', "Igitabo c'abadandaza"))
    await D('individual', 'SME', 'nif_certificate', null, L('Attestation NIF', 'NIF certificate', 'Icemezo ca NIF'))
    for (const [dt, role, lab] of [['passport_photo', 'signatory', L('Deux photos passeport de tous les signataires', 'Two passport photos of all signatories', 'Amafoto')], ['id_copy', 'signatory', L("Copie d'identité de tous les signataires", 'ID copy of all signatories', 'Ikopi ya karangamuntu')], ['articles', null, L('Statuts de la société', 'Memorandum & articles', 'Amategeko shingiro')], ['incorporation_certificate', null, L("Certificat d'incorporation", 'Certificate of incorporation', 'Icemezo co gushingwa')], ['nif_certificate', null, L('NIF', 'Tax Identification Code', 'NIF')], ['trade_register', null, L('Registre de commerce', 'Company registration', "Igitabo c'abadandaza")], ['board_resolution', null, L("Résolution du Conseil d'Administration", 'Board resolution', 'Icemezo c\'inama')], ['signatory_address_proof', 'signatory', L("Confirmation d'adresse des signataires", 'Address confirmation of signatories', "Icemezo c'aho baba")], ['business_address_proof', null, L("Confirmation d'adresse de la société", 'Business address confirmation', "Icemezo c'aho ishirahamwe riri")], ['signed_form_scan', null, L('Formulaire signé numérisé', 'Signed form (scan)', 'Urwandiko rwashizweko umukono')]] as const)
      await D('corporate', null, dt, role, lab)
    await D('corporate', null, 'partnership_deed', null, L('Contrat de partenariat', 'Partnership deed', 'Amasezerano'), false)
  }
  if (!(await one('SELECT 1 FROM routing_rules LIMIT 1'))) {
    const R = (name: string, pr: number, cond: any, role: string) => pool.query('INSERT INTO routing_rules(name,priority,condition,add_role) VALUES($1,$2,$3,$4)', [name, pr, cond, role])
    await R('PEP → Compliance (Loi 1/02 art. 5)', 10, { any: [{ field: 'pep', eq: true }] }, 'compliance')
    await R('High risk → Compliance', 20, { any: [{ field: 'riskRating', eq: 'high' }] }, 'compliance')
    await R('AML hit → Compliance', 30, { any: [{ field: 'amlStatus', in: ['potential_match', 'sanctioned', 'pep'] }] }, 'compliance')
    await R('Exceptions / waivers → Operations', 40, { any: [{ field: 'hasExceptions', eq: true }] }, 'operations')
    await R('Corporate accounts → Operations', 50, { any: [{ field: 'customerType', eq: 'corporate' }] }, 'operations')
    await R('PEP + high risk / sanctions → MD/CEO (exceptional)', 90, { any: [{ field: 'amlStatus', eq: 'sanctioned' }, { field: 'riskScore', gte: 80 }] }, 'md')
  }
  await pool.query(`INSERT INTO settings(key,value) VALUES ('risk_config',$1),('sla_hours',$2),('dept_sla_hours',$3) ON CONFLICT DO NOTHING`, [DEFAULT_RISK, { PENDING_BRANCH_HEAD: 8, PENDING_OPERATIONS: 24, PENDING_COMPLIANCE: 48, PENDING_MD: 72 }, { operations: 24, compliance: 48, digital: 24, cards: 72, customer_service: 24, risk: 72, it: 8, audit: 240 }])
}

const uid = async (u: string) => (await one('SELECT * FROM users WHERE username=$1', [u]))
const actor = (u: any) => ({ id: u.id, name: u.display_name, role: u.role, branch: u.branch_code })
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex')

function person(id: string, roles: any[], f: string, l: string, extra: Partial<ReturnType<typeof emptyPerson>> = {}) {
  return { ...emptyPerson(id), roles, firstName: f, lastName: l, sex: 'F', dateOfBirth: '1990-04-12', placeOfBirth: 'Bujumbura', nationality: 'Burundaise', maritalStatus: 'Célibataire', idType: 'cni' as const, idNumber: `CNI-${id}-${f.length}${l.length}0482`, idExpiry: '', phone: '+257 79 123 456', email: `${f.toLowerCase()}.${l.toLowerCase()}@example.bi`, address: { residence: 'Rohero I', quarter: 'Rohero', avenue: 'Av. de la Plage 14', town: 'Bujumbura', commune: 'Mukaza', province: 'Bujumbura', country: 'Burundi', postalBox: 'BP 1234' }, occupation: 'Employée', profession: 'Comptable', jobTitle: 'Comptable senior', employerName: 'Brarudi', annualIncome: '18000000', ...extra }
}
export function sampleIndividual(): ApplicationData {
  const d = emptyApplicationData()
  d.account = { ...d.account, productCode: 'CUR', currency: 'BIF', accountName: 'NDAYIZEYE Béatrice', purpose: 'Salaire et dépenses courantes', expectedMonthlyInflow: '2500000', expectedMonthlyOutflow: '2000000' }
  d.people = [person('p1', ['holder'], 'Béatrice', 'Ndayizeye', { nif: '4000123456' }), person('p2', ['mandatee'], 'Jean', 'Ndayizeye', { sex: 'M', profession: 'Enseignant' })]
  d.incomeSources = [{ source: 'salary', amount: '18000000' }, { source: 'business', amount: '3000000', detail: 'Location' }]
  d.sourceOfWealth = 'Épargne sur salaire'
  d.otherAccounts = [{ accountName: 'NDAYIZEYE B.', bankBranch: 'BANCOBU Centre', accountType: 'Épargne', accountNumber: '1234567890' }]
  d.mandates = [{ personId: 'p2', idNumber: '', noLimit: false, limitAmount: '500000', limitCurrency: 'BIF', powers: ['cash_withdrawal', 'balance_enquiry'], otherPower: '' }]
  d.services = { ...d.services, chequeBook: true, chequeLeaves: '20', pesaflash: true, pesaflashLanguage: 'rn', mobileBanking: true, eStatement: true, eStatementEmail: 'beatrice.ndayizeye@example.bi' }
  d.declarations = { actingForSelf: true, thirdPartyDetails: '', accuracyConfirmed: true, consentDataProcessing: true, consentMarketing: false, rgoAcknowledged: true }
  d.referral = { source: 'staff', staffCode: 'FB1022', detail: '' }
  d.verification = { idVerifiedByStaff: true, idVerifiedNote: 'CNI originale vue', otpPlaceholderVerified: true }
  d.signing = { rule: 'singly', otherInstructions: '' }
  return d
}
export function sampleCorporate(name = 'Umucyo Trading S.A.'): ApplicationData {
  const d = emptyApplicationData()
  d.account = { ...d.account, productCode: 'CUR', currency: 'USD', accountName: name, purpose: 'Encaissements clients et paiements fournisseurs', expectedMonthlyInflow: '80000000', expectedMonthlyOutflow: '75000000', transactionCountries: ['Burundi', 'Tanzania', 'Kenya'] }
  d.entity = { legalName: name, legalStatus: 'limited_company', legalStatusOther: '', registrationNumber: 'RC/BUJ/2019/00128', incorporationDate: '2019-03-15', nif: '4000987654', postalBox: 'BP 5521', town: 'Bujumbura', phone: '+257 22 22 22 22', mobile: '+257 79 111 222', fax: '', email: 'finance@umucyo.bi', physicalAddress: '18 Boulevard de l\'Uprona, Rohero, Bujumbura', website: 'www.umucyo.bi', businessActivity: 'Commerce de gros et distribution', annualTurnover: '950000000', shareCapital: '50000000' }
  const sx = { sex: 'M' }
  d.people = [person('d1', ['director', 'signatory', 'beneficial_owner'], 'Emmanuel', 'Nkurunziza', { ...sx, designation: 'Administrateur Délégué', ownershipPct: '60' }), person('d2', ['director', 'signatory', 'beneficial_owner'], 'Chantal', 'Niyongabo', { designation: 'Directrice Financière', ownershipPct: '40' }), person('d3', ['director'], 'Paul', 'Mugisha', { ...sx, designation: 'Administrateur' }), person('d4', ['director'], 'Alice', 'Kamikazi', { designation: 'Administratrice' }), person('d5', ['director'], 'Gilbert', 'Havyarimana', { ...sx, designation: 'Administrateur' }), person('o1', ['operator'], 'Yves', 'Ciza', { ...sx, designation: 'Comptable' })]
  d.signing = { rule: 'jointly', otherInstructions: 'Deux signatures conjointes au-delà de 10 000 USD' }
  d.introducer = { name: 'Léonce Barutwanayo', companyDesignation: 'Burundi Logistics – Directeur', address: 'Av. du Large 3, Kigobe', finbankAccount: '00110012345678', phone: '+257 22 25 11 11', officePhone: '+257 22 25 11 12', mobile: '+257 79 555 444', yearsKnown: '6' }
  d.operators = [{ personId: 'd2', role: 'admin', accounts: [], canInitiate: true, canApprove: true, canView: true, limitAmount: '20000', limitScope: 'per_day' }, { personId: 'o1', role: 'operator', accounts: [], canInitiate: true, canApprove: false, canView: true, limitAmount: '5000', limitScope: 'per_transaction' }]
  d.services = { ...d.services, chequeBook: true, chequeLeaves: '40', chequeBooks: 2, internetBanking: true, finconnect: true, finconnectOtpChannel: 'both', eStatement: true, eStatementEmail: 'finance@umucyo.bi', transferOrderBooklet: true }
  d.sourceOfWealth = 'Bénéfices commerciaux réinvestis'
  d.declarations = { actingForSelf: true, thirdPartyDetails: '', accuracyConfirmed: true, consentDataProcessing: true, consentMarketing: true, rgoAcknowledged: true }
  d.referral = { source: 'existing_customer', staffCode: '', detail: 'Burundi Logistics' }
  d.verification = { idVerifiedByStaff: true, idVerifiedNote: 'Originaux RC, NIF et CNI vus', otpPlaceholderVerified: true }
  return d
}

async function demoApp(maker: any, ct: 'individual' | 'joint' | 'corporate', data: ApplicationData, opts: { gps?: any; docsFor?: boolean } = {}) {
  const ref = `DAO-${maker.branch_code}-2026-${String(Math.floor(Math.random() * 90000) + 10000)}-SEED`
  const name = ct === 'corporate' ? data.entity.legalName : data.people.filter((p) => p.roles.includes('holder')).map((p) => `${p.firstName} ${p.lastName}`).join(' & ')
  const a = await one(`INSERT INTO applications(ref,kind,customer_type,product_code,branch_code,data,applicant_name,created_by,capture_channel,gps,referral_source,referral_staff_code) VALUES($1,'new_customer',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [ref, ct, data.account.productCode, maker.branch_code, data, name, maker.id, maker.role === 'field_agent' ? 'field' : 'branch', opts.gps ?? null, data.referral.source, data.referral.staffCode || null])
  const { requiredDocuments } = await import('../services/workflow')
  const { saveEncrypted, sha256 } = await import('../services/storage')
  for (const r of await requiredDocuments(a)) {
    const id = (await one('SELECT gen_random_uuid() id')).id
    saveEncrypted(`${a.id}/${id}.bin`, PNG)
    await pool.query('INSERT INTO documents(id,application_id,doc_type,party_id,file_name,mime_type,size_bytes,sha256,storage_path,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, a.id, r.docType, r.partyId, `${r.docType}.png`, 'image/png', PNG.length, sha256(PNG), `${a.id}/${id}.bin`, maker.id])
  }
  return a
}

export async function seedDemo() {
  if (await one(`SELECT 1 FROM applications WHERE ref LIKE '%SEED' LIMIT 1`)) return
  const [clerk1, clerk2, agent1, bh1, ops1, comp1, md1, clerk3, bh3] = await Promise.all(['clerk1', 'clerk2', 'agent1', 'bh1', 'ops1', 'comp1', 'md1', 'clerk3', 'bh3'].map(uid))
  const ind = (f: string, l: string, extra: any = {}, mut?: (d: ApplicationData) => void) => { const d = sampleIndividual(); d.people[0] = { ...d.people[0], firstName: f, lastName: l, ...extra }; d.account.accountName = `${l.toUpperCase()} ${f}`; d.mandates = []; d.people = [d.people[0]]; mut?.(d); return d }
  // 1. fully opened individual (Flexcube mock success) → service tasks
  let a = await demoApp(clerk1, 'individual', sampleIndividual()); await submit(a.id, actor(clerk1)); await decide(a.id, actor(bh1), 'approve', 'Dossier complet')
  // 2. opened corporate (bh → operations)
  a = await demoApp(clerk2, 'corporate', sampleCorporate()); await submit(a.id, actor(clerk2)); await decide(a.id, actor(bh1), 'approve', 'OK'); await decide(a.id, actor(ops1), 'approve', 'Pièces conformes')
  // 3. pending branch head
  for (const [f, l] of [['Didier', 'Ndayishimiye'], ['Sylvie', 'Irakoze'], ['Fiston', 'Ndikumana']]) { a = await demoApp(clerk1, 'individual', ind(f, l)); await submit(a.id, actor(clerk1)) }
  // 4. PEP → compliance (with AML/EDD cases)
  a = await demoApp(clerk2, 'individual', ind('Révérien', 'Ministre-Nzeyimana', { pep: true, pepDetails: 'Ancien ministre (2015-2020)' })); await submit(a.id, actor(clerk2)); await decide(a.id, actor(bh1), 'approve', 'PPE déclaré — transmis à la conformité')
  // 5. potential match + high inflow → compliance + md
  a = await demoApp(clerk1, 'corporate', sampleCorporate('Match Global Mining SARL'), {}); { const d = a.data; d.entity.businessActivity = 'Mining and precious metals export'; d.declarations.actingForSelf = false; d.declarations.thirdPartyDetails = 'Holding étrangère'; await pool.query('UPDATE applications SET data=$2 WHERE id=$1', [a.id, d]) }
  await submit(a.id, actor(clerk1)); await decide(a.id, actor(bh1), 'approve', 'Risque élevé — escalade')
  // 5b. Exceptional case already cleared by Ops + Compliance, awaiting MD/CEO decision
  a = await demoApp(clerk1, 'corporate', sampleCorporate('Match Gold Traders SARL'), {}); { const d = a.data; d.entity.businessActivity = 'Mining and precious metals export'; d.declarations.actingForSelf = false; d.declarations.thirdPartyDetails = 'Holding étrangère (EAU)'; d.exceptions = [{ code: 'min_deposit_waiver', reason: 'Dépôt initial versé sous 30 jours' }]; await pool.query('UPDATE applications SET data=$2 WHERE id=$1', [a.id, d]) }
  await submit(a.id, actor(clerk1)); await decide(a.id, actor(bh1), 'approve', 'Escalade — exportateur minier')
  { const st = (await pool.query('SELECT status FROM applications WHERE id=$1', [a.id])).rows[0].status
    if (st === 'PENDING_OPERATIONS') await decide(a.id, actor(ops1), 'approve', 'Dérogation justifiée')
    await pool.query(`UPDATE tasks SET status='done', closed_at=now(), history = history || $2::jsonb WHERE application_id=$1 AND department='compliance'`, [a.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Conformité', action: 'edd_complete', note: 'EDD réalisée, faux positif sur le nom' }])])
    if ((await pool.query('SELECT status FROM applications WHERE id=$1', [a.id])).rows[0].status === 'PENDING_COMPLIANCE') await decide(a.id, actor(comp1), 'approve', 'EDD complète — décision DG requise') }
  // 6. Flexcube down → fallback manual
  setMockCoreDown(true); a = await demoApp(clerk2, 'individual', ind('Corefail', 'Bigirimana')); await submit(a.id, actor(clerk2)); await decide(a.id, actor(bh1), 'approve', 'OK'); setMockCoreDown(false)
  // 7. returned
  a = await demoApp(clerk1, 'individual', ind('Joseph', 'Nsabimana')); await submit(a.id, actor(clerk1)); await decide(a.id, actor(bh1), 'return', 'Preuve d\'adresse illisible — merci de rescanner')
  // 8. Akabirya minor + guardian, field agent with GPS, opened
  { const d = ind('Kevin', 'Hakizimana', { dateOfBirth: '2016-02-01', idType: 'birth_certificate', idNumber: 'AN-2016-0042', phone: '', occupation: 'Élève', profession: '', jobTitle: '', annualIncome: '' }); d.account.productCode = 'AKB'; d.account.accountName = 'HAKIZIMANA Kevin (Akabirya)'; d.people.push(person('g1', ['guardian'], 'Marie', 'Hakizimana', { relationshipToMinor: 'Mère' })); d.incomeSources = [{ source: 'other', amount: '600000', detail: 'Épargne parentale' }]; d.services = { ...emptyApplicationData().services }
    a = await demoApp(agent1, 'individual', d, { gps: { lat: -3.3822, lng: 29.3644, accuracy: 12 } }); await submit(a.id, actor(agent1)); await decide(a.id, actor(bh1), 'approve', 'OK') }
  // 9. joint account pending (agent)
  { const d = ind('Claude', 'Ntahomvukiye', { sex: 'M' }); d.people.push(person('p2', ['holder'], 'Annick', 'Ntahomvukiye')); d.account.productCode = 'SAV'; d.account.accountName = 'NTAHOMVUKIYE Claude & Annick'; d.signing = { rule: 'either', otherInstructions: '' }
    a = await demoApp(agent1, 'joint', d, { gps: { lat: -3.4271, lng: 29.9246, accuracy: 20 } }); await submit(a.id, actor(agent1)) }
  // 10. Gitega branch
  a = await demoApp(clerk3, 'individual', ind('Espérance', 'Ndayisaba', {}, (d) => { d.referral = { source: 'social_media', staffCode: '', detail: 'Facebook' } })); await submit(a.id, actor(clerk3)); await decide(a.id, actor(bh3), 'approve', 'OK')
  // drafts
  await demoApp(clerk1, 'individual', ind('Brigitte', 'Nibizi', {}, (d) => { d.declarations.accuracyConfirmed = false }))
  // existing customers for KYC refresh / duplicate search
  await pool.query(`INSERT INTO customers(cif,customer_type,full_name,id_number,nif,date_of_birth,phone,branch_code,risk_rating,kyc_last_review,kyc_next_review,data) VALUES ('000123456','individual','NIYONKURU Gaspard','CNI-00-77812','4000555111','1982-07-04','+257 79 444 333','001','medium','2024-11-01','2026-11-01','{}'),('000123457','corporate','Kirundo Coffee Coop','RC/KIR/2012/0044','4000666222',NULL,'+257 79 222 111','004','high','2025-10-25','2026-10-25','{}'),('000123458','individual','NSHIMIRIMANA Odette','CNI-00-11290',NULL,'1975-01-20','+257 76 888 999','002','low','2023-12-01','2026-12-01','{}') ON CONFLICT DO NOTHING`)
  await kycRefreshJob({ id: null, name: 'seed', role: 'system' })
  // devices
  await pool.query(`INSERT INTO devices(device_id,label,user_id,branch_code,status,app_version,pending_items,last_seen_at,last_sync_at,last_gps) VALUES ('TAB-001','Samsung Tab A9 – Agent Bujumbura',$1,'001','active','1.0.0',2,now()-interval '5 min',now()-interval '5 min','{"lat":-3.3822,"lng":29.3644}'),('TAB-002','Samsung Tab A9 – Agent Gitega',$1,'003','locked','1.0.0',0,now()-interval '3 days',now()-interval '3 days',NULL),('PC-BJ-014','Poste guichet 14',$2,'001','active','1.0.0',0,now(),now(),NULL) ON CONFLICT DO NOTHING`, [agent1.id, clerk1.id])
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  ;(async () => { await migrate(); await seedReference(); if (process.env.SEED_DEMO !== 'false') await seedDemo(); console.log('seeded'); await pool.end() })().catch((e) => { console.error(e); process.exit(1) })
}
