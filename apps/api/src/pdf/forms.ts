import type { ApplicationData, Person } from '../../../../packages/shared/domain'
import { bandHeader, bar, boxes, check, CW, field, footer, H, label, M, NAVY, newDoc, notRequested, para, sigBox, smallHeader, table, v, W, type Doc } from './kit'

export interface PdfContext {
  ref: string; customerType: 'individual' | 'joint' | 'corporate'; kind: string
  productCode: string; productName: string; formTypeLabel: string  // current|savings|akabirya
  branchName: string; branchCode: string; date: string; accountNumber?: string | null; cif?: string | null
  data: ApplicationData
  bank: { openedBy?: string; authorizedBy?: string; idVerified: boolean; amlDone: boolean; amlStatus: string; riskRating: string; riskScore: number; riskFactors: string[]; exceptionsApprovedBy?: string; managerApproval?: string; approvals: Array<{ role: string; name: string; decision: string; at: string; comment: string }>; referenceVerifiedBy?: string; screenings: Array<{ name: string; result: string; score: number }> }
}
const fullName = (p?: Person) => (p ? `${p.lastName.toUpperCase()} ${p.firstName}`.trim() : '')
const fmtDate = (d: string) => (d ? d.slice(0, 10).split('-').reverse().join('') : '')
const legal: Record<string, string> = { sole_proprietor: 'Entreprise individuelle / Sole Proprietor', limited_company: 'S.A.R.L / Limited Company', government: 'Entité gouvernementale / Government Entity', partnership: 'Société en nom collectif / Partnership', semi_public: 'Société mixte / Semi-Public Company', public_company: 'Société publique / Public Limited Liability Company', ngo: 'ONG/Organismes internationaux / NGO/International Organisations', society_trust: 'Société/Association/Club/Fidéicommis / Society/Association/Club/Trust', other: 'Autre (spécifier) / Other (Specify)' }

function page(doc: Doc, ctx: PdfContext, n: { i: number }, title: string) { doc.addPage(); n.i++; return () => footer(doc, ctx.ref, `${title} · p.${n.i}`) }

// ---------- Common pages ----------
function specimenPage(doc: Doc, ctx: PdfContext, n: { i: number }, signers: Person[], chunk: number) {
  const done = page(doc, ctx, n, 'Specimens de signatures')
  let y = smallHeader(doc, 'SPECIMENS DE SIGNATURES ET POUVOIRS', chunk ? `Page de continuation ${chunk + 1}` : undefined)
  y = field(doc, M, y, CW, 'Intitulé', ctx.data.account.accountName, 60)
  y = field(doc, M, y, CW / 2 - 6, 'Compte N°', ctx.accountNumber ?? '', 60)
  y += 6
  const slots = ['A', 'B', 'C', 'D']
  slots.forEach((s, i) => {
    const p = signers[i]; const col = i % 2, row = Math.floor(i / 2)
    const x = M + col * (CW / 2 + 4), yy = y + row * 190, w = CW / 2 - 4
    doc.rect(x, yy, w, 182).lineWidth(0.8).strokeColor('#333').stroke()
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(s, x + 6, yy + 6)
    doc.rect(x + w / 2 - 40, yy + 20, 80, 92).dash(3, { space: 2 }).stroke().undash()
    label(doc, x + w / 2 - 40, yy + 60, '(photo)', 80); doc.text('', 0, 0)
    const role = p?.roles.includes('mandatee') ? 'du Mandataire' : 'du Titulaire'
    label(doc, x + 6, yy + 120, `Nom et Signature ${role} :`, w - 12, 7)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(p ? fullName(p) : '', x + 6, yy + 132, { width: w - 12 })
    doc.rect(x + 6, yy + 144, w - 12, 32).lineWidth(0.5).strokeColor('#999').stroke()
  })
  y += 390
  y = bar(doc, y, 'POUVOIRS                                                                                     SIGNATURES AUTORISEES')
  const r = ctx.data.signing.rule
  check(doc, M + 4, y, 'Séparément', r === 'singly' || r === 'either', 120)
  check(doc, M + 4, y + 14, `Conjointement - ( à préciser ) ${r === 'jointly' || r === 'other' ? ctx.data.signing.otherInstructions : ''}`, r === 'jointly' || r === 'other', 300)
  field(doc, M + CW / 2, y, CW / 2, 'Date :', fmtDate(ctx.date).replace(/(\d\d)(\d\d)(\d{4})/, '$1/$2/$3'), 50)
  done()
}

function rgoPage(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const done = page(doc, ctx, n, 'Règlement Général des Opérations')
  let y = smallHeader(doc, '') + 40
  y = para(doc, M + 30, y, CW - 60, '"J\'ai (nous avons) le plaisir d\'accuser réception du Règlement Général des Opérations de Finbank s.a dont j\'ai (nous avons) pris connaissance et les termes pour lesquels je (nous) vous marque (ons) mon (notre) accord."', 11, 'Helvetica-Oblique') + 20
  y = para(doc, M + 30, y, CW - 60, '"Ndemeje (turemeje) ko twasomye Amategeko Ngenderwako Agenga ibikorwa vya Finbank natahuye (twatahuye), ndashizeko (turashizeko) umukono wo kwemeza amasezerano."', 11, 'Helvetica-Oblique') + 40
  field(doc, M + 30, y, 250, 'Numéro de Compte / Inomero y\'Ikonte', ctx.accountNumber ?? '', 130); y += 30
  label(doc, M + 30, y, 'Lu et Approuvé / Nabisomye Kandi Navyemeje', 300, 10); y += 26
  field(doc, M + 30, y, 250, 'Le / Itariki', ctx.data.declarations.rgoAcknowledged ? ctx.date.slice(0, 10) : '', 80); y += 30
  label(doc, M + 30, y, 'Nom - Prénom & Signature / Izina n\'Umukono', 300, 10)
  const holders = ctx.data.people.filter((p) => p.roles.includes('holder') || p.roles.includes('signatory') || p.roles.includes('guardian'))
  holders.slice(0, 4).forEach((p, i) => { sigBox(doc, M + 30 + (i % 2) * 250, y + 18 + Math.floor(i / 2) * 70, 230, 60, fullName(p)) })
  done()
}

function pesaflashPage(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const s = ctx.data.services; const requested = s.pesaflash || s.ecocash
  const done = page(doc, ctx, n, 'PesaFlash')
  let y = smallHeader(doc, 'APPLICATION FORM "PESAFLASH"', 'DEMANDE D\'ACCES AU SERVICE DE «PESAFLASH»') + 6
  y = field(doc, M, y, 260, 'Branch / Agence', ctx.branchName, 90) + 4
  y = para(doc, M, y, CW, 'I hereby apply for "PESAFLASH". I submit the information required for PESAFLASH offered under "FINBANK SA":', 8)
  y = para(doc, M, y, CW, 'Je sollicite par la présente l\'accès au service de «PESAFLASH». Veuillez trouver ci-après les informations nécessaires pour les services de «PESAFLASH» offerts par "FINBANK SA":', 8) + 6
  const holder = ctx.data.people.find((p) => p.roles.includes('holder') || p.roles.includes('signatory'))
  const req = requested ? holder : undefined
  y = field(doc, M, y, CW, 'Name / Nom', req ? (ctx.customerType === 'corporate' ? ctx.data.entity.legalName : fullName(holder)) : '', 160, 16)
  y = field(doc, M, y, CW, 'Mobile Number / Numéro de téléphone', req ? (ctx.customerType === 'corporate' ? ctx.data.entity.mobile : holder?.phone) : '', 160, 16)
  y = field(doc, M, y, CW, 'Account Number / Numéro de Compte', req ? ctx.accountNumber ?? '' : '', 160, 16)
  label(doc, M, y + 2, 'Ecocash Agent (Tick x) / Agent Ecocash (cocher x)', 200, 7.5)
  check(doc, M + 220, y + 1, 'Y', requested && s.ecocashAgent, 40); check(doc, M + 260, y + 1, 'N', requested && !s.ecocashAgent, 40); y += 18
  y = field(doc, M, y, CW, 'Ecocash Agent Code / Code Agent', requested ? s.ecocashAgentCode : '', 160, 16)
  label(doc, M, y + 2, 'Language (Tick x) / Langage (cocher x)', 200, 7.5)
  check(doc, M + 220, y + 1, 'French', requested && s.pesaflashLanguage === 'fr', 70); check(doc, M + 290, y + 1, 'Kirundi', requested && s.pesaflashLanguage === 'rn', 70); check(doc, M + 360, y + 1, 'English', requested && s.pesaflashLanguage === 'en', 70); y += 18
  y = field(doc, M, y, CW, 'Email', req ? (ctx.customerType === 'corporate' ? ctx.data.entity.email : holder?.email) : '', 160, 16)
  label(doc, M, y + 2, 'Are you interested by Ecocash Banking Services? / Êtes-vous intéressé par services bancaires Ecocash ?', 330, 7.5)
  check(doc, M + 360, y + 1, 'Y', requested && s.ecocash, 40); check(doc, M + 400, y + 1, 'N', requested && !s.ecocash, 40); y += 22
  y = para(doc, M, y, CW, 'If yes, please provide your Econet/Leo Number (If different from one above) / Si oui, veuillez fournir votre Numéro d\'Econet / Leo (si différent de celui ci-dessus)', 7.5)
  y = field(doc, M, y, CW, 'Econet / Leo', requested ? s.econetNumber : '', 160, 16) + 8
  y = bar(doc, y, 'DECLARATION')
  y = para(doc, M, y, CW, 'Je déclare que les informations ci-dessus sont correctes et que j\'ai lu et accepté les conditions générales de vente du service « Mobile Banking » mentionnées au recto. Je demande à la Banque de m\'envoyer le Mobile Banking PIN par SMS à mon numéro de téléphone mobile. Je suis d\'accord que les Conditions Générales d\'Utilisation du/des compte(s) désigné(s) sont applicables aux opérations à travers le mobile aussi. Je suis également conscient que la Banque est en droit de modifier les termes et conditions sans préavis. Je suis d\'accord que la transaction exécutée en utilisant les services mobiles bancaires sous mon nom d\'utilisateur et MPIN sera contraignante pour moi / tous les titulaires du compte joint. Je tiens à relier tous mes comptes existants et les comptes ouverts à l\'avenir au numéro de client et au numéro de téléphone mobile.', 8) + 14
  field(doc, M, y, 200, 'Date:', requested ? ctx.date.slice(0, 10) : '', 40, 16); sigBox(doc, M + 260, y, CW - 260, 40, 'Signature:'); y += 56
  field(doc, M, y, CW, 'Customer Service Officer:', requested ? ctx.bank.openedBy : '', 130, 16)
  if (!requested) notRequested(doc)
  done()
}

function mandatairePage(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const ms = ctx.data.mandates; const requested = ms.length > 0
  const done = page(doc, ctx, n, 'Nomination d\'un mandataire')
  let y = smallHeader(doc, '') + 4
  const h = ctx.data.people.find((p) => p.roles.includes('holder')) ?? ctx.data.people[0]
  const clientName = ctx.customerType === 'corporate' ? ctx.data.entity.legalName : fullName(h)
  y = field(doc, M, y, 300, 'Nom du client:', requested ? clientName : '', 80)
  y = field(doc, M, y, 300, 'Adresse:', requested ? (ctx.customerType === 'corporate' ? ctx.data.entity.physicalAddress : [h?.address.avenue, h?.address.quarter, h?.address.town].filter(Boolean).join(', ')) : '', 80)
  y = field(doc, M, y, 300, 'Tél:', requested ? (ctx.customerType === 'corporate' ? ctx.data.entity.phone : h?.phone) : '', 80)
  y = field(doc, M, y, 300, 'Adresse Electronique:', requested ? (ctx.customerType === 'corporate' ? ctx.data.entity.email : h?.email) : '', 80)
  label(doc, M + 330, y - 50, 'A Monsieur l\'Administrateur Directeur Général\nde la Finbank S.A', 200, 9); y += 10
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('OBJET: NOMINATION D\'UN MANDATAIRE', M, y); y += 20
  y = para(doc, M, y, CW, `Madame, Monsieur,\nJe/Nous ${requested ? clientName : '................................................'}, désigne/désignons par la présente la (les) personne(s) ci-dessous comme mon/nos personne(s) autorisée(s) pour le(s) compte(s) ci-dessous pour effectuer des transactions en mon/notre nom.`, 8.5) + 4
  y = table(doc, M, y, [{ w: CW / 2, label: 'Intitulé de compte' }, { w: CW / 2, label: 'Numéro de compte' }], requested ? [[ctx.data.account.accountName, ctx.accountNumber ?? '']] : [], 15, 2)
  const pp = (id: string) => ctx.data.people.find((p) => p.id === id)
  y = table(doc, M, y, [{ w: 190, label: 'Nom du/des mandataire(s)' }, { w: 130, label: 'Numéro de la pièce d\'identité' }, { w: 110, label: 'Montant limite' }, { w: CW - 430, label: 'Sans limite (Oui/Non)' }],
    ms.map((m) => [fullName(pp(m.personId)), m.idNumber || pp(m.personId)?.idNumber || '', m.noLimit ? '' : `${m.limitAmount} ${m.limitCurrency}`, m.noLimit ? 'Oui' : 'Non']), 15, 3)
  y = para(doc, M, y, CW, 'Si Oui, la limite est de BIF/USD/EUR ............   Veuillez joindre une copie d\'identité / Passeport et deux photos couleur au format PP pour chacun. Veuillez spécifier sur la fiche de spécimen de signature les pouvoirs donnés au mandataire.', 8) + 4
  const has = (k: string) => ms.some((m) => (m.powers as string[]).includes(k))
  check(doc, M, y, 'Retrait d\'espèces', has('cash_withdrawal'), 200); check(doc, M + 260, y, 'Demande de solde de compte', has('balance_enquiry'), 200); y += 14
  check(doc, M, y, 'Retrait de carnet de chèques', has('cheque_book_collection'), 200); check(doc, M + 260, y, 'Historique du compte', has('account_history'), 200); y += 14
  y = field(doc, M, y, CW, 'Toute autre transaction (préciser)', ms.map((m) => m.otherPower).filter(Boolean).join('; '), 150) + 4
  y = bar(doc, y, 'DECLARATION')
  y = para(doc, M, y, CW, 'Le Client sera lié par cette procuration et la Banque procédera conformément à ces instructions. Toutefois, la Banque aura la latitude de vérifier toute transaction effectuée par le mandataire et, le cas échéant, surseoir à l\'action jusqu\'à ce que la vérification soit effective. Il appartient au client, en tant qu\'autorité investie du pouvoir de donner le mandat, de notifier à la Banque tout(s) changement(s) de personne habilitée. La Banque ne saurait être tenue responsable si ces modifications n\'ont pas été communiquées par écrit avec accusé de réception.', 8) + 10
  sigBox(doc, W - M - 220, y, 220, 50, '(Signature du titulaire)')
  if (!requested) notRequested(doc)
  done()
}

function finconnectPages(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const s = ctx.data.services; const requested = s.finconnect
  const corp = ctx.customerType === 'corporate'
  const sub = corp ? 'COMPANY' : 'INDIVIDUAL & JOINT ACCOUNTS'
  let done = page(doc, ctx, n, 'FinConnect')
  let y = smallHeader(doc, 'FINCONNECT ACTIVATION FORM', sub)
  label(doc, M, y, 'Please fill in this form in capital letters', 300, 8); y += 14
  boxes(doc, M + 40, y, 8, requested ? fmtDate(ctx.date) : ''); label(doc, M, y + 3, 'Date', 40, 7); y += 20
  y = bar(doc, y, 'I. CUSTOMER DETAILS')
  const h = ctx.data.people.find((p) => p.roles.includes('holder')) ?? ctx.data.people[0]
  const contact = ctx.data.people.find((p) => p.roles.includes('signatory')) ?? h
  if (corp) {
    y = field(doc, M, y, CW, 'Company name', requested ? ctx.data.entity.legalName.toUpperCase() : '', 110)
    y = field(doc, M, y, CW, 'Address', requested ? ctx.data.entity.physicalAddress.toUpperCase() : '', 110)
    y = field(doc, M, y, CW, 'Contact person', requested ? fullName(contact).toUpperCase() : '', 110)
    y = field(doc, M, y, CW, 'Designation', requested ? contact?.designation.toUpperCase() : '', 110)
  } else {
    y = field(doc, M, y, CW, 'Surname', requested ? h?.lastName.toUpperCase() : '', 110)
    y = field(doc, M, y, CW, 'Name', requested ? h?.firstName.toUpperCase() : '', 110)
    y = field(doc, M, y, CW, 'Email', requested ? h?.email : '', 110)
    y = bar(doc, y, 'II. KNOW YOUR CUSTOMER')
    field(doc, M, y, CW / 2 - 4, 'Avenue', requested ? h?.address.avenue : '', 60); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Profession', requested ? h?.profession : '', 60)
    field(doc, M, y, CW / 2 - 4, 'City', requested ? h?.address.town : '', 60); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Mobile No', requested ? h?.phone : '', 60)
  }
  label(doc, M, y + 2, 'How would you like to receive your login details & Channel for OTP*:', 280, 7.5)
  const ch = s.finconnectOtpChannel
  check(doc, M + 290, y + 1, 'Mobile', requested && ch === 'mobile', 70); check(doc, M + 360, y + 1, 'E-mail', requested && ch === 'email', 70); check(doc, M + 430, y + 1, 'Both', requested && ch === 'both', 70); y += 14
  label(doc, M, y, '*One Time Password', 200, 6.5); y += 12
  y = bar(doc, y, `${corp ? 'II' : 'III'}. OPERATOR DETAILS & ACCOUNTS TO ACCESS`)
  const ops = requested ? ctx.data.operators : []
  const pp = (id: string) => ctx.data.people.find((p) => p.id === id)
  for (let i = 0; i < Math.max(2, Math.min(ops.length, 3)); i++) {
    const o = ops[i]; const p = o ? pp(o.personId) : undefined
    y = field(doc, M, y, CW, `Name & Designation of Operator ${i + 1}`, p ? `${fullName(p).toUpperCase()} - ${p.designation}` : '', 160)
    field(doc, M, y, CW / 3 - 4, 'Account 1', o?.accounts[0] ?? (o ? ctx.accountNumber ?? '' : ''), 50); field(doc, M + CW / 3, y, CW / 3 - 4, 'Account 2', o?.accounts[1] ?? '', 50); y = field(doc, M + 2 * CW / 3, y, CW / 3, 'Account 3', o?.accounts[2] ?? '', 50)
    field(doc, M, y, CW / 2 - 4, 'Email', p?.email ?? '', 50); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Téléphone', p?.phone ?? '', 60) + 4
  }
  if (!requested) notRequested(doc)
  done()
  done = page(doc, ctx, n, 'FinConnect (2)')
  y = smallHeader(doc, 'FINCONNECT ACTIVATION FORM', sub)
  y = bar(doc, y, `${corp ? 'III' : 'IV'}. ACCESS PARAMETERS`)
  y = table(doc, M, y, [{ w: 150, label: 'Operator name' }, { w: 100, label: 'Account number' }, { w: 45, label: 'Admin' }, { w: 50, label: 'Operator' }, { w: 45, label: 'Viewer' }, { w: 45, label: 'Initiate' }, { w: 45, label: 'Approve' }, { w: CW - 480, label: 'Limit Amount**' }],
    ops.map((o) => [fullName(pp(o.personId)), o.accounts[0] ?? ctx.accountNumber ?? '', o.role === 'admin' ? 'X' : '', o.role === 'operator' ? 'X' : '', o.role === 'viewer' ? 'X' : '', o.canInitiate ? 'X' : '', o.canApprove ? 'X' : '', o.limitAmount ? `${o.limitAmount} / ${o.limitScope === 'per_day' ? 'day' : 'txn'}` : '']), 15, 4)
  y = para(doc, M, y, CW, '* Roles: Admin has full access / Operator can initiate & approve transactions / Viewer can view reports & statements.\n** Limit Amount: maximum daily cumulative amount for all transactions initiated through FINCONNECT. This can be a limit per transaction and/or a limit per day.', 7) + 6
  y = bar(doc, y, `${corp ? 'IV' : 'V'}. CUSTOMER ACCEPTANCE OF THE TERMS AND CONDITIONS`)
  y = para(doc, M, y, CW, 'I/We understand and accept the FINCONNECT Terms and Conditions, a copy of which I/We have been given.', 8) + 4
  y = sigBox(doc, M, y, CW / 2, 44, 'Name & Signature:', requested ? (corp ? fullName(contact) : fullName(h)) : '') + 4
  if (!corp) {
    y = bar(doc, y, 'FOR JOINT ACCOUNTS ONLY')
    y = para(doc, M, y, CW, 'We confirm having authorized the above detailed applicants to be registered for Internet Banking against our joint account. We confirm having read and understood the FINCONNECT terms and conditions, a copy of which we have been given.', 7.5)
    const holders = ctx.customerType === 'joint' && requested ? ctx.data.people.filter((p) => p.roles.includes('holder')) : []
    y = table(doc, M, y, [{ w: 30, label: '#' }, { w: 200, label: 'Name' }, { w: 120, label: 'Phone number' }, { w: 110, label: 'Signature' }, { w: CW - 460, label: 'Date' }], holders.map((p, i) => [String(i + 1), fullName(p), p.phone, '', '']), 18, 3)
  }
  y = bar(doc, y + 4, 'FOR BANK USE ONLY', '#F4D9BF')
  y = table(doc, M, y, [{ w: 120, label: '' }, { w: 160, label: 'Staff name' }, { w: 140, label: 'Signature' }, { w: CW - 420, label: 'Date' }], [['Created by', '', '', ''], ['Approved by', '', '', '']], 18)
  label(doc, M, y + 4, 'DISCLAIMER: 1. Please fill out all fields to the best of your knowledge (* mandatory)        www.finbank.co.bi   Call center: 170 (toll-free on Lumitel), +257 76 170 170, +257 75 170 100', CW, 6.5)
  if (!requested) notRequested(doc)
  done()
}

function chequePage(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const s = ctx.data.services; const requested = s.chequeBook
  const done = page(doc, ctx, n, 'Demande de chéquier')
  let y = smallHeader(doc, 'DEMANDE DE CHÉQUIER') - 40
  for (let k = 0; k < 2; k++) {
    const top = y + 52
    const filled = requested && k < Math.max(1, Math.min(2, s.chequeBooks))
    para(doc, M, top, CW, `Par le débit de mon compte, je vous prie de confectionner et tenir à ma disposition  ${filled ? '1' : '......'}  Carnet(s) de chèque de ${filled ? s.chequeLeaves : '20 ou 40'} formules`, 10)
    field(doc, M, top + 40, CW / 2, 'Intitulé du compte :', filled ? ctx.data.account.accountName : '', 90)
    field(doc, M, top + 60, CW / 2, 'Numéro de compte :', filled ? ctx.accountNumber ?? '' : '', 90)
    sigBox(doc, M + CW / 2 + 10, top + 40, CW / 2 - 10, 40, 'Signature du titulaire')
    bar(doc, top + 104, 'PARTIE RÉSERVÉE À LA BANQUE', '#F4D9BF')
    label(doc, M, top + 124, 'Vérifié signature et pouvoir', 200, 8); sigBox(doc, M + CW / 2 + 10, top + 120, CW / 2 - 10, 40, 'Signature et Date')
    y = top + 190
    if (k === 0) { doc.moveTo(M, y + 10).lineTo(W - M, y + 10).dash(4, { space: 3 }).strokeColor('#999').stroke().undash(); y += 30 }
  }
  if (!requested) notRequested(doc)
  done()
}

// ---------- Individual / joint main form (FR / Kirundi) ----------
function individualMain(doc: Doc, ctx: PdfContext, n: { i: number }, holders: Person[], cont: number) {
  const d = ctx.data
  const done = page(doc, ctx, n, 'Formulaire individuel')
  let y = bandHeader(doc, 'Formulaire d\'Ouverture de Compte Individuel', 'grey', cont ? `/ Urwandiko rwuzuzwa mu kwuguruza ikonte y'umuntu umwe — Continuation ${cont}` : '/ Urwandiko rwuzuzwa mu kwuguruza ikonte y\'umuntu umwe')
  label(doc, M, y + 3, 'Compte N° / N° y\'Ikonte', 90, 7); boxes(doc, M + 95, y, 14, v(ctx.accountNumber))
  label(doc, M + 360, y + 3, 'Date / Igenekerezo', 70, 7); boxes(doc, M + 435, y, 8, fmtDate(ctx.date)); y += 18
  y = field(doc, M, y, CW, 'Nom / Izina', holders.map(fullName).join(' & '), 110)
  label(doc, M, y + 2, 'Je désire / Nous désirons ouvrir un (des) compte(s) auprès de la Finbank s.a. suivant les détails ci-après /', 360, 7)
  y = field(doc, M + 370, y, CW - 370, 'Agence / Ishami', ctx.branchName, 70)
  y = field(doc, M, y, CW, 'Nom de compte / Izina ry\'ikonte', d.account.accountName, 110)
  label(doc, M, y, 'Type de compte (Veuillez cocher (x) la case appropriée) / Ubwoko bw\'ikonte (Vivura (x) mu kadirisha mwipfuza)', CW, 7); y += 12
  check(doc, M, y, 'Compte Courant / Ikonte isanzwe', ctx.formTypeLabel === 'current', 180); check(doc, M + 190, y, 'Compte épargne / Ikonte y\'ukuzigama', ctx.formTypeLabel === 'savings', 200); check(doc, M + 400, y, 'Akabirya', ctx.formTypeLabel === 'akabirya', 100); y += 13
  label(doc, M, y, `Produit / Product: ${ctx.productName}`, CW, 6.5); y += 10
  label(doc, M, y + 1, 'Monnaie / Amafaranga akoreshwa (Vivura (x) mu kadirisha bihuye)', 260, 7)
  check(doc, M + 300, y, 'BIF', d.account.currency === 'BIF', 50); check(doc, M + 350, y, 'USD', d.account.currency === 'USD', 50); check(doc, M + 400, y, 'EUR', d.account.currency === 'EUR', 50); y += 14
  for (const [hi, p] of holders.entries()) {
    y = bar(doc, y, `Identification du Client / Ibiranga Umunywanyi${holders.length > 1 ? ` — Titulaire ${hi + 1 + cont * 2} : ${fullName(p)}` : ''}${p.roles.includes('guardian') ? ' (Tuteur légal / Umurezi)' : ''}`)
    const L = M, R = M + CW / 2 + 6, w = CW / 2 - 6
    const a = p.address
    field(doc, L, y, w, 'Résidence / Aho uba', a.residence, 80); y = field(doc, R, y, w, 'Nationalité / Ubwenegihugu', p.nationality, 100)
    field(doc, L, y, w, 'Quartier / Karitiye', [a.quarter, a.commune, a.province].filter(Boolean).join(', '), 80); y = field(doc, R, y, w, 'Occupation / Akazi ukora', p.occupation, 100)
    field(doc, L, y, w, 'Avenue / Ibarabara', a.avenue, 80); y = field(doc, R, y, w, 'Profession / Umwuga', p.profession, 100)
    field(doc, L, y, w, 'Ville / Igisagara', a.town, 80); y = field(doc, R, y, w, 'N° d\'identité / N° ya Karangamuntu', p.idNumber, 100)
    field(doc, L, y, w, 'B.P / Agasandugu ka Posita', a.postalBox, 80)
    label(doc, R, y + 2, 'Self-employed? / Wikorera utwawe ?', 120, 6.8); check(doc, R + 130, y + 1, 'Yes / Ego', p.selfEmployed, 60); check(doc, R + 190, y + 1, 'No / Oya', !p.selfEmployed, 60); y += 17
    field(doc, L, y, w, 'Téléphone / Terefone', p.phone, 80); field(doc, R, y, w / 2 - 2, 'Job title / Ico ukora', p.jobTitle, 52); y = field(doc, R + w / 2 + 2, y, w / 2 - 2, 'Annual income / Ayo winjiza ku mwaka', p.annualIncome, 64)
    y = field(doc, L, y, w, 'E-mail / Imeyire', p.email, 80)
  }
  if (cont === 0) {
    y = bar(doc, y, 'Autres comptes actuellement détenus à la Finbank s.a. ou dans d\'autres banques / Other accounts currently held with Finbank s.a. or other banks')
    y = table(doc, M, y, [{ w: 150, label: 'Intitulé du Compte / Uko Ikonte yitwa' }, { w: 140, label: 'Banque & Agence / Ibanki n\'ishami ryayo' }, { w: 120, label: 'Type de compte / Ubwoko bw\'ikonte' }, { w: CW - 410, label: 'N° de compte / Inomero y\'ikonte' }], d.otherAccounts.map((o) => [o.accountName, o.bankBranch, o.accountType, o.accountNumber]), 12, 3)
    const src = (k: string) => d.incomeSources.find((s) => s.source === k)
    y = table(doc, M, y, [{ w: 250, label: 'Source de revenue / Ahava amafaranga' }, { w: CW - 250, label: 'Amount (expected annual) / Igitigiri c\'ayo mafaranga yinjira (ku mwaka)' }],
      [['salary', '[ ] Salaries / Umushahara'], ['business', '[ ] Business income / Urudandazwa'], ['property_sale', '[ ] Sale of property / Ukugurisha ibitimuka'], ['other', '[ ] Others / Ibindi']].map(([k, l]) => [src(k) ? l.replace('[ ]', '[X]') + (src(k)?.detail ? ` (${src(k)!.detail})` : '') : l, src(k)?.amount ? `${src(k)!.amount} BIF` : '']), 12)
    y = bar(doc, y, 'FACILITES DU COMPTE (Veuillez (x) la case appropriée) / Ibikoreshwa kw\'Ikonte (Vivura (x) mu Kadirisha)')
    const s = d.services
    check(doc, M, y, 'Chéquier / Agatabu k\'amasheki', s.chequeBook, 120); check(doc, M + 125, y, 'PESA Flash', s.pesaflash, 80); check(doc, M + 205, y, 'E-statement / Ubuh. bwa none', s.eStatement, 120); check(doc, M + 330, y, 'Ecocash', s.ecocash, 70)
    y = field(doc, M + 400, y - 2, CW - 400, 'E-mail', s.eStatement ? s.eStatementEmail : '', 30) + 2
    sigBox(doc, M + 40, y, 200, 46, 'Signature du client / Umukono w\'Umunywanyi'); sigBox(doc, M + CW - 240, y, 200, 46, 'Signature vérifiée par / Umukono wasuzumwe na', '(Réservé à la Banque uniquement / Ibanki gusa)'); y += 52
    y = bar(doc, y, 'DOCUMENTS EXIGES (copies certifiées par le Secrétaire Général ou le Chef d\'agence) / INZANDIKO ZITEGEREZWA')
    check(doc, M, y, 'Deux Photos passeport de tous les signataires autorisés / Amafoto magufi abiri y\'abemerewe gusinya bose', true, CW); y += 11
    check(doc, M, y, 'Copie de l\'identité ou du Passeport de tous les signataires autorisés / Ikopi ya Karangamuntu canke y\'igitabu c\'inzira', true, CW); y += 11
    check(doc, M, y, 'Attestation de résidence / Urwandiko rukwemerera gucumbika mu Burundi (Ku Banyamahanga)', holders.some((p) => !/burund/i.test(p.nationality)), CW); y += 13
    y = bar(doc, y, 'RESERVE A LA BANQUE UNIQUEMENT / AHA MUSI HUZUZWA N\'IBANKI GUSA', '#F4D9BF')
    label(doc, M, y, 'Pièces d\'identité valides et authentifiées / Inzandiko ndangamuntu zitataye igihe kandi zemewe', 330, 7)
    check(doc, M + 340, y, 'Oui / Ego', ctx.bank.idVerified, 60); check(doc, M + 400, y, 'Non / Oya', !ctx.bank.idVerified, 60); y += 12
    field(doc, M, y, CW / 2 - 4, 'Compte ouvert par (Nom) / Ikonte yuguruwe na', ctx.bank.openedBy, 140); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Signature', '', 50)
    field(doc, M, y, CW / 2 - 4, 'Autorisé par (Nom) / Vyemejwe na (Izina)', ctx.bank.authorizedBy, 140); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Signature', '', 50)
  }
  done()
}

// ---------- Corporate main form (FR / EN) ----------
function corporatePage2(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const d = ctx.data, e = d.entity
  const done = page(doc, ctx, n, 'Account Opening Form')
  let y = bandHeader(doc, 'Formulaire d\'Ouverture de Compte / Account Opening Form', 'orange')
  label(doc, M, y + 3, 'Compte N° / Account No.', 90, 7); boxes(doc, M + 95, y, 14, v(ctx.accountNumber))
  label(doc, M + 380, y + 3, 'Date', 30, 7); boxes(doc, M + 435, y, 8, fmtDate(ctx.date)); y += 16
  label(doc, M, y + 2, 'Je désire / Nous désirons ouvrir un (des) compte(s) auprès de la Finbank Burundi suivant les détails ci-après / I or we request you to open the following account(s) with Finbank Burundi as per the following details', 360, 6.6)
  y = field(doc, M + 370, y, CW - 370, 'Agence / Branch', ctx.branchName, 70) + 6
  label(doc, M, y, 'Type de Compte (Veuillez cocher (x) la case appropriée) / Account Type (Please (x) tick where applicable)', CW, 7); y += 11
  check(doc, M, y, 'Compte Courant / Current Account', ctx.formTypeLabel === 'current', 170); check(doc, M + 180, y, 'Compte épargne / Savings Account', ctx.formTypeLabel === 'savings', 170); label(doc, M + 360, y, `Produit / Product: ${ctx.productName}`, CW - 360, 6.5); y += 13
  label(doc, M, y + 1, 'Monnaie (Veuillez cocher (x) la case appropriée) / Currency (Please (x) tick where applicable)', 280, 7)
  check(doc, M + 290, y, 'BIF', d.account.currency === 'BIF', 40); check(doc, M + 330, y, 'USD', d.account.currency === 'USD', 40); check(doc, M + 370, y, 'EUR', d.account.currency === 'EUR', 40); check(doc, M + 410, y, `Autre / Other: ${d.account.currencyOther}`, !!d.account.currencyOther, CW - 410); y += 14
  label(doc, M, y, 'Forme juridique (Veuillez cocher (x) la case appropriée) / Legal Status (Please (x) tick where applicable):', CW, 7); y += 11
  check(doc, M, y, 'Individu / Individual', false, 170); y += 11
  const keys = Object.keys(legal)
  keys.forEach((k, i) => check(doc, M + (i % 3) * 180, y + Math.floor(i / 3) * 11, legal[k] + (k === 'other' && e.legalStatus === 'other' ? `: ${e.legalStatusOther}` : ''), e.legalStatus === k, 178))
  y += Math.ceil(keys.length / 3) * 11 + 4
  y = field(doc, M, y, CW, 'Registre de Commerce / Company Registration Number', e.registrationNumber, 200)
  y = field(doc, M, y, CW, 'Nom de la Société ou de l\'Organisation / Company or Organization Name', e.legalName, 200)
  label(doc, M, y + 3, 'Date d\'Incorporation ou d\'Enregistrement / Date of Incorporation or Registration', 260, 7); boxes(doc, M + 300, y, 8, fmtDate(e.incorporationDate)); y += 17
  field(doc, M, y, CW / 2, 'Boîte Postale / Postal Address', e.postalBox, 120); y = field(doc, M + CW / 2 + 6, y, CW / 2 - 6, 'Ville / Town', e.town, 60)
  field(doc, M, y, CW / 3 - 4, 'N° de Téléphone / Telephone No.', e.phone, 90); field(doc, M + CW / 3, y, CW / 3 - 4, 'N° du cellulaire / Mobile No.', e.mobile, 90); y = field(doc, M + 2 * CW / 3, y, CW / 3, 'N° du Fax / Fax No.', e.fax, 70)
  y = field(doc, M, y, CW, 'Adresse électronique / E-mail address', e.email, 200)
  y = field(doc, M, y, CW, 'Adresse Physique de la Société (Lot/Immeuble/Avenue/Rue) / Full Physical Address of the business', e.physicalAddress, 260)
  y = field(doc, M, y, CW, 'Site Web / Website Address', e.website, 200)
  y = bar(doc, y, 'Autres comptes actuellement détenus à la Finbank Burundi ou dans d\'autres banques / Other accounts currently held with Finbank Burundi or other banks')
  y = table(doc, M, y, [{ w: 150, label: 'Intitulé du Compte / Account Name' }, { w: 140, label: 'Banque & Agence / Bank Name & Branch' }, { w: 120, label: 'Type de Compte / Type of Account' }, { w: CW - 410, label: 'N° de compte / Account No.' }], d.otherAccounts.map((o) => [o.accountName, o.bankBranch, o.accountType, o.accountNumber]), 12, 3)
  y = bar(doc, y, 'Coordonnées des Administrateurs / Partenaires / Fidéicommissaires / Membres / Propriétaires / Details of Directors / Partners / Trustees / Members / Proprietor')
  const dirs = d.people.filter((p) => p.roles.includes('director'))
  y = table(doc, M, y, [{ w: 300, label: 'Nom et Prénoms / First & Last Name' }, { w: CW - 300, label: 'N° de Téléphone / Telephone No.' }], dirs.slice(0, 4).map((p) => [fullName(p), p.phone]), 12, 4)
  if (dirs.length > 4) { label(doc, M, y - 2, `+ ${dirs.length - 4} autre(s) — voir page de continuation / see continuation page`, CW, 6.5); y += 8 }
  y = bar(doc, y, 'FACILITES DU COMPTE (Veuillez cocher (x) la case appropriée) / ACCOUNT FACILITIES (Please tick (x) where applicable)')
  const s = d.services
  check(doc, M, y, 'Chéquier / Cheque Book', s.chequeBook, 110); check(doc, M + 110, y, 'Mobile Banking', s.mobileBanking || s.pesaflash, 90); check(doc, M + 200, y, 'E-statement', s.eStatement, 80); check(doc, M + 280, y, 'Internet Banking', s.internetBanking || s.finconnect, 90); check(doc, M + 370, y, 'Carnet Ordre de Paiement / Transfer Order Booklet', s.transferOrderBooklet, CW - 370); y += 13
  y = field(doc, M, y, CW, 'E-mail address for E-statement', s.eStatement ? s.eStatementEmail : '', 150) + 2
  y = bar(doc, y, 'Parrain N°1 / Introducer 1')
  const I = d.introducer
  field(doc, M, y, CW / 2 - 4, 'Nom & Prénoms / First & Last Name', I.name, 120); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Raison sociale et Fonction / Company Name & Designation', I.companyDesignation, 150)
  y = field(doc, M, y, CW, 'Adresse Postale et Physique (N° de bloc/Rue/Avenue/Quartier) / Postal & Physical Address', I.address, 260)
  label(doc, M, y + 3, 'N° de compte à la Finbank Burundi / Finbank Burundi A/C No.', 200, 7); boxes(doc, M + 210, y, 14, I.finbankAccount); y += 16
  field(doc, M, y, CW / 3 - 4, 'N° de Téléphone / Telephone No.', I.phone, 90); field(doc, M + CW / 3, y, CW / 3 - 4, 'N° de téléphone au Bureau / Office No.', I.officePhone, 100); field(doc, M + 2 * CW / 3, y, CW / 3, 'N° de cellulaire / Mobile No.', I.mobile, 80)
  done()
}
function corporatePage3(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const d = ctx.data
  const done = page(doc, ctx, n, 'Mandate / Bank use')
  let y = M
  y = bar(doc, y, 'Attestation du Parrain / Certificate by Introducer')
  y = para(doc, M, y, CW, `Je souhaite introduire le client susnommé qui désire ouvrir et maintenir un compte dans votre établissement. Je le (les) connais depuis ${d.introducer.yearsKnown || '____'} ans et les coordonnées et adresse physique indiquées ci-dessus sont correctes. Je certifie que le titulaire de ce nouveau compte est digne de foi et apte à gérer un compte dans votre établissement. / I would like to introduce the above account applicant to open and maintain an account with you. I have known the individual(s) for ${d.introducer.yearsKnown || '____'} years and the physical location and address indicated herein is correct. I also confirm that I consider the new account holder suitable to operate an account with you.`, 6.6)
  label(doc, M, y + 3, 'Date', 30, 7); boxes(doc, M + 30, y, 8, d.introducer.name ? fmtDate(ctx.date) : ''); sigBox(doc, M + 140, y, 150, 30, 'Signature'); sigBox(doc, M + CW - 190, y, 190, 30, 'Signature vérifiée par / Signature Verified by', '(Réservé à la Banque uniquement / For Bank use only)'); y += 38
  y = bar(doc, y, 'SIGNATURE DU MANDATAIRE / SIGNATURE MANDATE FORM')
  label(doc, M, y, 'Compte du mandataire: Signatures autorisées (Veuillez cocher (x) la case appropriée) / Account Mandate: Signing Instructions (Please tick (x) where applicable)', CW, 7); y += 11
  const r = d.signing.rule
  check(doc, M, y, 'Seul / Singly', r === 'singly', 100); check(doc, M + 100, y, 'Conjointement / Jointly', r === 'jointly', 130); check(doc, M + 230, y, 'L\'un ou l\'autre / Either', r === 'either', 130); check(doc, M + 360, y, 'Autre (précisez ci-dessous) / Other (specify below)', r === 'other', CW - 360); y += 13
  y = field(doc, M, y, CW, 'Autres instructions (précisez ci-dessous) / Other Signing Instructions (specify below):', d.signing.otherInstructions, 280, 22)
  y = para(doc, M, y, CW, 'J\'ai/nous avons pris connaissance et souscris aux conditions préalables à l\'ouverture d\'un compte à la Finbank Burundi. Je suis/nous sommes conscient(s) que ledit compte sera ouvert à la seule discrétion de la Finbank Burundi et je m\'engage/nous nous engageons à dédommager la Finbank Burundi contre toute perte résultant de la fermeture du compte par la Banque sous réserve d\'un délai de 30 jours pour performance non satisfaisante du compte. J\'accepte/nous acceptons par ailleurs que les opérations sur ce compte soient soumises aux termes et conditions générales spécifiées de temps en temps et souscrites par moi/nous. Je confirme/nous confirmons l\'authenticité de toutes les informations contenues dans le présent formulaire.', 6.3)
  y = para(doc, M, y, CW, 'We have read and understood the conditions necessary to open and run an Account with Finbank Burundi and we oblige to comply. We agree that this account shall be opened solely at the discretion of Finbank Burundi and hereby agree to indemnify Finbank Burundi at our cost against claims arising out of the account being closed by Finbank Burundi upon issuance of 30 days\' notice due to unsatisfactory performance. Furthermore we accept that the operations of the account will be subject to the General Terms and Conditions as published from time to time signed by the company and confirm that all given information on this form is true and correct.', 6.3, 'Helvetica-Oblique')
  const sigs = d.people.filter((p) => p.roles.includes('signatory'))
  const ord = ['1er Signataire / 1st Signatory', '2ème Signataire / 2nd Signatory', '3ème Signataire / 3rd Signatory', '4ème Signataire / 4th Signatory']
  for (let i = 0; i < 4; i++) {
    const p = sigs[i]; const x = M + (i % 2) * (CW / 2 + 6), w = CW / 2 - 6, yy = y + Math.floor(i / 2) * 78
    doc.rect(x, yy, w, 13).fill('#EEF1F5'); label(doc, x + 3, yy + 3, ord[i], w, 7)
    field(doc, x, yy + 16, w, 'Nom & Prénoms / First & Last Name', p ? fullName(p) : '', 130)
    field(doc, x, yy + 33, w, 'Titre ou Fonction / Designation or Title', p?.designation ?? '', 130)
    sigBox(doc, x, yy + 50, w, 24, 'Signature')
  }
  y += 160
  if (sigs.length > 4) { label(doc, M, y - 4, `+ ${sigs.length - 4} signataire(s) supplémentaire(s) — voir page de continuation / see continuation page`, CW, 6.5); y += 6 }
  y = bar(doc, y, 'DOCUMENTS EXIGES (copies certifiées par le Secrétaire Général ou le Chef d\'agence) / DOCUMENTS REQUIRED (copies certified by Company Secretary or Branch Official)')
  const docsL = ['Deux photos passeport de tous les signataires autorisés / Two passport photographs of all authorized signatories', 'Copie de l\'identité ou du Passeport de tous les signataires autorisés / Copy of ID of all authorized signatories', 'Statuts de la société / Memorandum and articles of association, by-laws or constitution', 'Certificat d\'incorporation ou d\'inscription / Certificate of incorporation or business registration', 'NIF / Tax Identification Code', 'Registre de Commerce / Company Registration Number']
  const docsR = ['Résolution du Conseil d\'Administration ou extrait signé par le Président et le Secrétaire / Board resolution or extract signed by Chairman and Secretary', 'Confirmation d\'adresse des signataires/directeurs/partenaires/administrateurs/propriétaire (facture utilitaire* ou lettre de la société) / Confirmation of address of each signatory/director/partner/trustee/proprietor', 'Contrat de partenariat / Partnership deed', 'Confirmation d\'adresse de la société (Facture utilitaire* / Contrat de location) / Confirmation of business address (Utility bill* / Tenancy Agreement)']
  const yl = y
  docsL.forEach((t, i) => check(doc, M, yl + i * 14, t, false, CW / 2 - 6)); docsR.forEach((t, i) => check(doc, M + CW / 2 + 6, yl + i * 21, t, false, CW / 2 - 6))
  y = yl + 88
  label(doc, M + CW / 2 + 6, y - 4, '*Facture d\'eau ou d\'électricité ou du téléphone / Water or Electricity or Telephone receipt', CW / 2, 6); y += 6
  y = bar(doc, y, 'RESERVE A LA BANQUE UNIQUEMENT / FOR BANK USE ONLY', '#F4D9BF')
  const b = ctx.bank
  label(doc, M, y + 1, 'Pièces d\'identité valides et authentifiées / Valid identification documents obtained and authenticated', 360, 7); check(doc, M + 380, y, 'Oui / Yes', b.idVerified, 60); check(doc, M + 440, y, 'Non / No', !b.idVerified, 60); y += 12
  y = field(doc, M, y, CW, 'Personne citée en référence vérifiée par (Nom) / Reference verified by (Name)', b.referenceVerifiedBy, 260, 12)
  y = field(doc, M, y, CW, 'Exceptions approuvées par / Exceptions approved by', b.exceptionsApprovedBy, 260, 12)
  label(doc, M, y + 1, 'Vérification faite en matière de lutte contre le blanchiment d\'argent / AML check done', 360, 7); check(doc, M + 380, y, 'Oui / Yes', b.amlDone, 60); check(doc, M + 440, y, 'Non / No', !b.amlDone, 60); y += 12
  y = field(doc, M, y, CW, 'Autorisation du Directeur / Manager\'s approval', b.managerApproval, 260, 12)
  field(doc, M, y, CW * 0.62, 'Compte ouvert par (Nom) / Account opened by (Name)', b.openedBy, 200, 12); y = field(doc, M + CW * 0.64, y, CW * 0.36, 'Signature :', '', 50, 12)
  field(doc, M, y, CW * 0.62, 'Autorisé par (Nom) / Authorized by (Name)', b.authorizedBy, 200, 12); y = field(doc, M + CW * 0.64, y, CW * 0.36, 'Signature :', '', 50, 12)
  y = field(doc, M, y, CW, 'Commentaires additionnels / Additional comments:', `Risque ${b.riskRating} (${b.riskScore}) · AML ${b.amlStatus}`, 260, 12)
  y = field(doc, M, y, CW, 'Exceptions (Donner les raisons) / Exceptions (Give reasons)', d.exceptions.map((x) => `${x.code}: ${x.reason}`).join('; '), 260, 12)
  field(doc, M, y, CW, 'Autorisation du Directeur d\'agence / Branch Manager\'s approval', b.approvals.find((a) => a.role === 'branch_head' && a.decision === 'approve')?.name ?? '', 260, 12)
  done()
}
function continuationParties(doc: Doc, ctx: PdfContext, n: { i: number }, title: string, people: Person[]) {
  const done = page(doc, ctx, n, 'Continuation')
  let y = smallHeader(doc, 'PAGE DE CONTINUATION / CONTINUATION PAGE', title)
  y = table(doc, M, y, [{ w: 160, label: 'Nom et Prénoms / First & Last Name' }, { w: 100, label: 'Titre ou Fonction / Designation' }, { w: 90, label: 'N° de Téléphone / Telephone' }, { w: 90, label: 'N° pièce d\'identité / ID No.' }, { w: CW - 440, label: 'Signature' }], people.map((p) => [fullName(p), p.designation, p.phone, p.idNumber, '']), 26, 10)
  done()
}

// ---------- KYC / AML annex (added page, not part of the official forms) ----------
function annex(doc: Doc, ctx: PdfContext, n: { i: number }) {
  const d = ctx.data
  const done = page(doc, ctx, n, 'Annexe KYC/LBC-FT')
  let y = smallHeader(doc, 'ANNEXE KYC / LBC-FT — KYC / AML ANNEX', `Réf. ${ctx.ref} · ${ctx.kind} · ${ctx.customerType}`)
  y = para(doc, M, y, CW, 'Annexe complémentaire aux formulaires officiels, requise par la loi n°1/02 du 4 février 2008 (modifiée par la loi n°1/08 du 27 mars 2025) et la réglementation LBC/FT de la BRB. Données traitées conformément à la loi n°1/03 du 10 mars 2026 portant protection des données à caractère personnel.', 7) + 2
  y = bar(doc, y, '1. Compte / Account')
  field(doc, M, y, CW / 2 - 4, 'Produit / Product', `${ctx.productName} (${ctx.productCode})`, 90); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Objet du compte / Purpose', d.account.purpose, 90)
  field(doc, M, y, CW / 3 - 4, 'Entrées mensuelles prévues / Exp. inflow', d.account.expectedMonthlyInflow, 105); field(doc, M + CW / 3, y, CW / 3 - 4, 'Sorties mensuelles / Exp. outflow', d.account.expectedMonthlyOutflow, 100); y = field(doc, M + 2 * CW / 3, y, CW / 3, 'Pays / Countries', d.account.transactionCountries.join(', '), 60)
  y = field(doc, M, y, CW, 'Origine du patrimoine / Source of wealth', d.sourceOfWealth, 150)
  if (ctx.customerType === 'corporate') { field(doc, M, y, CW / 2 - 4, 'Activité / Business activity', d.entity.businessActivity, 90); field(doc, M + CW / 2 + 4, y, CW / 4 - 4, 'NIF', d.entity.nif, 30); y = field(doc, M + 3 * CW / 4, y, CW / 4, 'Chiffre d\'affaires', d.entity.annualTurnover, 70) }
  y = bar(doc, y, '2. Parties (titulaires, tuteurs, administrateurs, signataires, bénéficiaires effectifs, mandataires)')
  const roleFr: Record<string, string> = { holder: 'Titulaire', director: 'Administrateur', signatory: 'Signataire', beneficial_owner: 'Bénéf. effectif', mandatee: 'Mandataire', guardian: 'Tuteur', operator: 'Opérateur' }
  y = table(doc, M, y, [{ w: 110, label: 'Nom / Name' }, { w: 70, label: 'Rôle(s)' }, { w: 52, label: 'Né(e) le / DOB' }, { w: 60, label: 'Lieu / POB' }, { w: 70, label: 'Pièce / ID type-No' }, { w: 48, label: 'Expire / Expiry' }, { w: 32, label: '% UBO' }, { w: 30, label: 'PPE' }, { w: CW - 472, label: 'AML' }],
    d.people.map((p) => [fullName(p), p.roles.map((r) => roleFr[r]).join(', '), p.dateOfBirth, p.placeOfBirth, `${p.idType} ${p.idNumber}`, p.idExpiry, p.ownershipPct, p.pep ? 'OUI' : 'non', ctx.bank.screenings.find((s) => s.name === `${p.firstName} ${p.lastName}`.trim())?.result ?? '']), 12)
  const peps = d.people.filter((p) => p.pep)
  if (peps.length) y = field(doc, M, y, CW, 'Détails PPE / PEP details', peps.map((p) => `${fullName(p)}: ${p.pepDetails}`).join('; '), 120)
  const minor = d.people.find((p) => p.roles.includes('guardian'))
  if (minor) y = field(doc, M, y, CW, 'Tuteur légal / Guardian (Akabirya)', `${fullName(minor)} — lien: ${minor.relationshipToMinor}`, 150)
  y = bar(doc, y, '3. Déclarations / Declarations')
  check(doc, M, y, 'Agit pour son propre compte / Acting on own behalf', d.declarations.actingForSelf, 260); y = field(doc, M + 270, y - 2, CW - 270, 'Sinon, pour le compte de', d.declarations.thirdPartyDetails, 100)
  check(doc, M, y, 'Exactitude des informations confirmée / Accuracy confirmed', d.declarations.accuracyConfirmed, 260); check(doc, M + 270, y, 'Consentement traitement des données (loi 1/03 2026)', d.declarations.consentDataProcessing, 260); y += 12
  check(doc, M, y, 'Consentement marketing / Marketing consent', d.declarations.consentMarketing, 260); check(doc, M + 270, y, 'RGO accusé de réception / RGO acknowledged', d.declarations.rgoAcknowledged, 260); y += 14
  y = bar(doc, y, '4. Provenance / Referral')
  const refL: Record<string, string> = { staff: 'Personnel / Staff', existing_customer: 'Client existant / Existing customer', agent: 'Agent', walk_in: 'Visite en agence / Branch walk-in', social_media: 'Réseaux sociaux / Social media', advertisement: 'Publicité / Advertisement' }
  field(doc, M, y, CW / 2 - 4, 'Source', refL[d.referral.source] ?? '', 60); y = field(doc, M + CW / 2 + 4, y, CW / 2 - 4, 'Code agent / Staff code', d.referral.staffCode, 100)
  y = bar(doc, y, '5. Contrôles banque / Bank controls', '#F4D9BF')
  check(doc, M, y, 'Originaux des pièces vus et vérifiés par l\'agent / Original IDs sighted & verified by staff', ctx.bank.idVerified, 330); label(doc, M + 340, y, `Note: ${d.verification.idVerifiedNote}`, CW - 340, 6.5); y += 12
  field(doc, M, y, CW / 3 - 4, 'Statut AML', ctx.bank.amlStatus, 60); field(doc, M + CW / 3, y, CW / 3 - 4, 'Notation risque / Risk', `${ctx.bank.riskRating} (${ctx.bank.riskScore}/100)`, 70); y = field(doc, M + 2 * CW / 3, y, CW / 3, 'CIF Flexcube', ctx.cif ?? '', 60)
  y = field(doc, M, y, CW, 'Facteurs de risque / Risk factors', ctx.bank.riskFactors.join(', '), 130)
  y = table(doc, M, y, [{ w: 100, label: 'Étape / Step' }, { w: 140, label: 'Nom / Name' }, { w: 70, label: 'Décision' }, { w: 100, label: 'Date' }, { w: CW - 410, label: 'Commentaire' }], ctx.bank.approvals.map((a) => [a.role, a.name, a.decision, a.at.slice(0, 16).replace('T', ' '), a.comment]), 12, 2)
  done()
}

export async function renderPack(ctx: PdfContext): Promise<Buffer> {
  const doc = newDoc({ title: `Dossier d'ouverture ${ctx.ref}`, subject: 'FinBank account opening pack' })
  const chunks: Buffer[] = []
  doc.on('data', (c) => chunks.push(c))
  const end = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))))
  const n = { i: 0 }
  const d = ctx.data
  const signers = [...d.people.filter((p) => p.roles.includes(ctx.customerType === 'corporate' ? 'signatory' : 'holder') || p.roles.includes('guardian')), ...d.people.filter((p) => p.roles.includes('mandatee'))]
  const uniq = signers.filter((p, i) => signers.findIndex((x) => x.id === p.id) === i)
  if (ctx.customerType === 'corporate') {
    for (let k = 0; k === 0 || k * 4 < uniq.length; k++) specimenPage(doc, ctx, n, uniq.slice(k * 4, k * 4 + 4), k)
    corporatePage2(doc, ctx, n); corporatePage3(doc, ctx, n)
    const dirs = d.people.filter((p) => p.roles.includes('director')); if (dirs.length > 4) continuationParties(doc, ctx, n, 'Administrateurs / Directors (suite)', dirs.slice(4))
    const sigs = d.people.filter((p) => p.roles.includes('signatory')); if (sigs.length > 4) continuationParties(doc, ctx, n, 'Signataires / Signatories (suite)', sigs.slice(4))
    rgoPage(doc, ctx, n); pesaflashPage(doc, ctx, n); mandatairePage(doc, ctx, n); finconnectPages(doc, ctx, n); chequePage(doc, ctx, n)
  } else {
    for (let k = 0; k === 0 || k * 4 < uniq.length; k++) specimenPage(doc, ctx, n, uniq.slice(k * 4, k * 4 + 4), k)
    pesaflashPage(doc, ctx, n); finconnectPages(doc, ctx, n)
    const holders = d.people.filter((p) => p.roles.includes('holder') || p.roles.includes('guardian'))
    for (let k = 0; k === 0 || k * 2 < holders.length; k++) individualMain(doc, ctx, n, holders.slice(k * 2, k * 2 + 2), k)
    rgoPage(doc, ctx, n); mandatairePage(doc, ctx, n); chequePage(doc, ctx, n)
  }
  annex(doc, ctx, n)
  doc.end()
  return end
}
export { H }
