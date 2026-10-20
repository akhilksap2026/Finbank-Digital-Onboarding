import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { enqueue, getDraft, saveDraft, type LocalDraft } from '../lib/offline'
import { getGps } from '../lib/sync'
import { uuid } from '../lib/crypto'
import { Badge, Card, Check, Field, Select, Table, Text } from '../components/ui'
import { L, t } from '../i18n'
import { emptyApplicationData, emptyPerson, type ApplicationData, type Person } from '../../../../packages/shared/domain'
import { validateApplication, type Issue } from '../../../../packages/shared/validation'

type Step = 'start' | 'account' | 'entity' | 'parties' | 'contact' | 'profile' | 'decl' | 'services' | 'mandates' | 'docs' | 'review'
const STEP_PREFIX: Record<Step, string[]> = { start: [], account: ['account'], entity: ['entity'], parties: ['people', 'signing'], contact: ['address', 'phone', 'email'], profile: ['incomeSources', 'sourceOfWealth', 'otherAccounts', 'introducer'], decl: ['declarations', 'referral', 'verification', 'exceptions'], services: ['services'], mandates: ['mandates', 'operators'], docs: ['documents'], review: [] }
const ROLES: Person['roles'] = ['holder', 'director', 'signatory', 'beneficial_owner', 'mandatee', 'guardian', 'operator']
const ROLE_L: Record<string, string> = { holder: 'Titulaire', director: 'Administrateur', signatory: 'Signataire', beneficial_owner: 'Bénéficiaire effectif', mandatee: 'Mandataire', guardian: 'Tuteur / parent', operator: 'Opérateur FinConnect' }
const PROVINCES = ['Buhumuza', 'Bujumbura', 'Burunga', 'Butanyerera', 'Gitega']

export default function Journey() {
  const { id } = useParams(); const nav = useNavigate()
  const { session, online, refreshQueue, sync } = useSession()
  const [draft, setDraft] = useState<LocalDraft | null>(null)
  const [server, setServer] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [step, setStep] = useState<Step>('start')
  const [issues, setIssues] = useState<Issue[]>([])
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api('/catalog/products').then(setProducts).catch(() => setProducts(JSON.parse(localStorage.getItem('fb.products') || '[]'))) }, [])
  useEffect(() => { if (products.length) localStorage.setItem('fb.products', JSON.stringify(products)) }, [products])
  useEffect(() => { (async () => {
    if (id === 'new') { const gps = session!.user.role === 'field_agent' ? await getGps() : null; setDraft({ clientUuid: uuid(), kind: 'new_customer', customerType: 'individual', data: emptyApplicationData(), updatedAt: new Date().toISOString(), gps }); return }
    const local = await getDraft(id!)
    if (local) { setDraft(local); if (local.serverId && online) loadServer(local.serverId); return }
    const a = await api(`/applications/${id}`); setServer(a)
    setDraft({ clientUuid: a.client_uuid ?? a.id, serverId: a.id, ref: a.ref, version: a.version, kind: a.kind, customerType: a.customer_type, data: a.data, updatedAt: a.updated_at })
    setStep('account')
  })().catch((e) => setMsg({ tone: 'bad', text: e.message })) }, [id])
  async function loadServer(sid: string) { const a = await api(`/applications/${sid}`); setServer(a); setDraft((d) => d && { ...d, version: a.version }) }

  const product = products.find((p) => p.code === draft?.data.account.productCode)
  const rule = product && { code: product.code, customerTypes: product.customer_types, currencies: product.currencies, ...product.rules }
  const allIssues = useMemo(() => (draft ? validateApplication(draft.customerType as any, draft.data, rule as any) : []), [draft, product])
  const corporate = draft?.customerType === 'corporate'
  const steps: Step[] = ['start', 'account', ...(corporate ? ['entity' as Step] : []), 'parties', 'contact', 'profile', 'decl', 'services', 'mandates', 'docs', 'review']
  if (!draft) return <div className="muted">…</div>
  const d = draft.data
  const set = (fn: (x: ApplicationData) => void) => setDraft((cur) => { const c = structuredClone(cur!); fn(c.data); c.updatedAt = new Date().toISOString(); return c })
  const err = (path: string) => [...issues, ...allIssues].find((i) => i.path === path)?.message
  const editable = !server || ['DRAFT', 'RETURNED'].includes(server.status)
  const stepIssues = (s: Step) => allIssues.filter((i) => STEP_PREFIX[s].some((p) => i.path.startsWith(p) || (s === 'contact' && /\.(address|phone|email)/.test(i.path)) )).length

  async function persist(): Promise<LocalDraft> {
    const cur = draft!
    await saveDraft(cur)
    if (cur.serverId && server && !server.client_uuid) {
      // created on the server directly (not via a tablet): update straight away
      const r = await api(`/applications/${cur.serverId}`, { method: 'PATCH', body: { data: cur.data, version: cur.version, productCode: cur.data.account.productCode || undefined } })
      const n = { ...cur, version: r.version }; setDraft(n); await saveDraft(n); return n
    }
    await enqueue({ opId: uuid(), type: cur.serverId ? 'update' : 'create', clientUuid: cur.clientUuid, at: new Date().toISOString(), payload: cur.serverId ? { data: cur.data, version: cur.version, productCode: cur.data.account.productCode || undefined } : { kind: cur.kind, customerType: cur.customerType, customerId: (cur as any).customerId, data: cur.data, productCode: cur.data.account.productCode || undefined, gps: cur.gps ?? undefined } })
    await refreshQueue()
    if (navigator.onLine) { await sync(); const fresh = await getDraft(cur.clientUuid); if (fresh) { setDraft(fresh); if (fresh.serverId) await loadServer(fresh.serverId); return fresh } }
    return cur
  }
  async function save(next?: Step) {
    setBusy(true); setMsg(null)
    try { const r = await persist(); setMsg({ tone: 'ok', text: r.serverId ? `Enregistré · ${r.ref}` : 'Enregistré localement (chiffré), synchronisation en attente' }); if (id === 'new') nav(`/journey/${r.clientUuid}`, { replace: true }); if (next) setStep(next) }
    catch (e: any) { setMsg({ tone: 'bad', text: e.body?.error === 'version_conflict' ? 'Conflit de version : le dossier a été modifié ailleurs. Rechargez.' : e.message }) } finally { setBusy(false) }
  }
  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const r = await persist(); if (!r.serverId) throw new Error('Connexion requise pour soumettre / Online connection required to submit')
      const s = await api(`/applications/${r.serverId}/submit`, { body: {} })
      setMsg({ tone: 'ok', text: `Soumis : ${s.status}` }); nav(`/applications/${r.serverId}`)
    } catch (e: any) { if (e.body?.issues) { setIssues(e.body.issues); setMsg({ tone: 'bad', text: `${e.body.issues.length} point(s) bloquant(s) avant soumission` }) } else setMsg({ tone: 'bad', text: e.message }) } finally { setBusy(false) }
  }
  const idx = steps.indexOf(step)
  return <>
    <div className="page-h"><h1>{draft.ref ?? t('newApplication')}</h1>{server && <Badge v={server.status} />}<span className="tag">{draft.customerType} · {draft.kind}</span>{draft.gps && <span className="tag">GPS {draft.gps.lat.toFixed(4)}, {draft.gps.lng.toFixed(4)}</span>}<span className="spacer" />
      {server && <button onClick={() => nav(`/applications/${server.id}`)}>Détail →</button>}</div>
    {server?.status === 'RETURNED' && <div className="banner warn">Retourné : {server.approvals?.filter((a: any) => a.decision === 'return').slice(-1)[0]?.comment}</div>}
    {!editable && <div className="banner warn">Dossier verrouillé ({server.status}) – lecture seule.</div>}
    <div className="stepper">{steps.map((s, i) => <div key={s} className={`step ${s === step ? 'on' : ''} ${i < idx ? 'done' : ''} ${stepIssues(s) && i < idx ? 'bad' : ''}`} onClick={() => setStep(s)}><span className="n">{i + 1}</span>{t(`s_${s}`)}{stepIssues(s) > 0 && i < idx && <span className="err">· {stepIssues(s)}</span>}</div>)}</div>
    {msg && <div className={`banner ${msg.tone}`}>{msg.text}</div>}
    <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
      {step === 'start' && <StartStep draft={draft} setDraft={setDraft} />}
      {step === 'account' && <AccountStep d={d} set={set} products={products} customerType={draft.customerType} err={err} />}
      {step === 'entity' && <EntityStep d={d} set={set} err={err} />}
      {step === 'parties' && <PartiesStep d={d} set={set} err={err} customerType={draft.customerType} minor={!!product?.rules?.requiresGuardian} />}
      {step === 'contact' && <ContactStep d={d} set={set} err={err} corporate={corporate} />}
      {step === 'profile' && <ProfileStep d={d} set={set} err={err} />}
      {step === 'decl' && <DeclStep d={d} set={set} err={err} />}
      {step === 'services' && <ServicesStep d={d} set={set} err={err} />}
      {step === 'mandates' && <MandatesStep d={d} set={set} err={err} />}
    </fieldset>
    {step === 'docs' && <DocsStep server={server} reload={() => server && loadServer(server.id)} editable={editable} online={online} people={d.people} />}
    {step === 'review' && <ReviewStep draft={draft} issues={[...allIssues, ...issues.filter((i) => i.code === 'missing_document')]} product={product} server={server} />}
    <div className="footer-bar">
      <button disabled={idx === 0} onClick={() => setStep(steps[idx - 1])}>← {t('back')}</button><span className="spacer" />
      {editable && <button onClick={() => save()} disabled={busy}>{t('save')}</button>}
      {step !== 'review' ? <button className="primary" disabled={busy} onClick={() => (editable ? save(steps[idx + 1]) : setStep(steps[idx + 1]))}>{t('next')} →</button>
        : editable && <button className="accent" disabled={busy || !online} onClick={submit}>{t('submit')}</button>}
    </div>
  </>
}

type SP = { d: ApplicationData; set(fn: (x: ApplicationData) => void): void; err(p: string): string | undefined }

function StartStep({ draft, setDraft }: { draft: LocalDraft; setDraft: (f: any) => void }) {
  const [q, setQ] = useState({ q: '', idNumber: '', nif: '', phone: '' }); const [res, setRes] = useState<any>(null); const [e, setE] = useState('')
  const locked = !!draft.serverId
  async function search() { setE(''); try { setRes(await api(`/customers/search?${new URLSearchParams(q)}`)) } catch (x: any) { setE(x.message) } }
  const pick = (c: any, kind: string) => setDraft((cur: any) => ({ ...cur, kind, customerType: c.customer_type, customerId: c.id }))
  return <div className="grid g2">
    <Card title="Type de dossier">
      <Field label="Opération"><Select value={draft.kind} onChange={(v) => !locked && setDraft((c: any) => ({ ...c, kind: v }))} options={[['new_customer', 'Nouveau client'], ['additional_account', 'Client existant – compte supplémentaire'], ['kyc_update', 'Client existant – mise à jour KYC']]} /></Field>
      <Field label="Type de client"><div className="chips">{[['individual', 'Particulier'], ['joint', 'Compte joint'], ['corporate', 'Entreprise / association']].map(([v, l]) => <button type="button" key={v} className={`chip ${draft.customerType === v ? 'on' : ''}`} disabled={locked} onClick={() => setDraft((c: any) => ({ ...c, customerType: v, data: v === 'joint' && c.data.people.length < 2 ? { ...c.data, people: [...c.data.people, emptyPerson('p2')] } : c.data }))}>{l}</button>)}</div></Field>
      {draft.kind !== 'new_customer' && !(draft as any).customerId && <div className="banner warn">Sélectionnez le client existant à droite.</div>}
      {(draft as any).customerId && <div className="banner ok">Client existant sélectionné</div>}
      {locked && <p className="muted">Le type ne peut plus être modifié après la première synchronisation.</p>}
    </Card>
    <Card title="Recherche de doublons (obligatoire avant création)">
      <div className="grid g2"><Field label="Nom"><Text value={q.q} onChange={(v) => setQ({ ...q, q: v })} /></Field><Field label="N° pièce d'identité"><Text value={q.idNumber} onChange={(v) => setQ({ ...q, idNumber: v })} /></Field>
        <Field label="NIF"><Text value={q.nif} onChange={(v) => setQ({ ...q, nif: v })} /></Field><Field label="Téléphone"><Text value={q.phone} onChange={(v) => setQ({ ...q, phone: v })} /></Field></div>
      <button type="button" onClick={search}>{t('search')}</button>{e && <div className="err">{e}</div>}
      {res && <>
        <h3 style={{ margin: '14px 0 6px' }}>Clients ({res.customers.length})</h3>
        <Table columns={['CIF', 'Nom', 'Pièce', 'Agence', 'Prochaine revue KYC', '']} rows={res.customers.map((c: any) => [c.cif, c.full_name, c.id_number, c.branch_code, c.kyc_next_review?.slice(0, 10), <div className="row"><button type="button" onClick={() => pick(c, 'additional_account')}>+ Compte</button><button type="button" onClick={() => pick(c, 'kyc_update')}>KYC</button></div>])} empty="Aucun client trouvé" />
        {res.applications.length > 0 && <div className="banner warn" style={{ marginTop: 10 }}>Dossiers en cours avec ces critères : {res.applications.map((a: any) => `${a.ref} (${a.status})`).join(', ')}</div>}
      </>}
    </Card>
  </div>
}

function AccountStep({ d, set, err, products, customerType }: SP & { products: any[]; customerType: string }) {
  const { lang } = useSession()
  const eligible = products.filter((p) => p.customer_types.includes(customerType))
  const p = products.find((x) => x.code === d.account.productCode)
  return <div className="grid g2">
    <Card title="Produit">
      <div className="grid g2">{eligible.map((x) => <button type="button" key={x.code} className={`chip ${x.code === d.account.productCode ? 'on' : ''}`} style={{ minHeight: 64, borderRadius: 12, textAlign: 'left' }} onClick={() => set((a) => { a.account.productCode = x.code; if (!x.currencies.includes(a.account.currency)) a.account.currency = x.currencies[0] })}><b>{L(x.names, lang)}</b><br /><small>{x.code} · {x.currencies.join('/')}</small></button>)}</div>
      {err('account.productCode') && <div className="err">{err('account.productCode')}</div>}
      {p && <p className="muted" style={{ fontSize: 14 }}>{Object.entries(p.min_opening || {}).map(([c, v]) => `Dépôt initial min. ${Number(v).toLocaleString('fr-FR')} ${c}`).join(' · ')}</p>}
    </Card>
    <Card title="Compte">
      <Field label="Intitulé du compte" required error={err('account.accountName')}><Text value={d.account.accountName} onChange={(v) => set((a) => { a.account.accountName = v })} /></Field>
      <div className="grid g2"><Field label="Devise" error={err('account.currency')}><Select value={d.account.currency} onChange={(v) => set((a) => { a.account.currency = v as any })} options={(p?.currencies ?? ['BIF', 'USD', 'EUR']).map((c: string) => [c, c])} /></Field>
        <Field label="Objet du compte" required error={err('account.purpose')}><Text value={d.account.purpose} onChange={(v) => set((a) => { a.account.purpose = v })} /></Field>
        <Field label="Entrées mensuelles prévues (BIF)"><Text inputMode="numeric" value={d.account.expectedMonthlyInflow} onChange={(v) => set((a) => { a.account.expectedMonthlyInflow = v })} /></Field>
        <Field label="Sorties mensuelles prévues (BIF)"><Text inputMode="numeric" value={d.account.expectedMonthlyOutflow} onChange={(v) => set((a) => { a.account.expectedMonthlyOutflow = v })} /></Field></div>
      <Field label="Pays des transactions (séparés par virgule)"><Text value={d.account.transactionCountries.join(', ')} onChange={(v) => set((a) => { a.account.transactionCountries = v.split(',').map((s) => s.trim()).filter(Boolean) })} /></Field>
    </Card>
  </div>
}

function EntityStep({ d, set, err }: SP) {
  const e = d.entity; const f = (k: keyof typeof e, label: string, req = false) => <Field label={label} required={req} error={err(`entity.${k}`)}><Text value={String(e[k] ?? '')} onChange={(v) => set((a) => { (a.entity as any)[k] = v })} /></Field>
  return <Card title="Entreprise / association (Formulaire d'ouverture – p.1)"><div className="grid g3">
    {f('legalName', 'Raison sociale', true)}
    <Field label="Statut juridique" required error={err('entity.legalStatus')}><Select value={e.legalStatus} onChange={(v) => set((a) => { a.entity.legalStatus = v as any })} options={[['sole_proprietor', 'Entreprise individuelle'], ['limited_company', 'SPRL / SU'], ['public_company', 'SA'], ['partnership', 'Société en nom collectif'], ['government', 'Gouvernement'], ['semi_public', 'Paraétatique'], ['ngo', 'ONG / ASBL'], ['society_trust', 'Association / Trust'], ['other', 'Autre']]} /></Field>
    {e.legalStatus === 'other' && f('legalStatusOther', 'Préciser', true)}
    {f('registrationNumber', 'N° RCCM / enregistrement', true)}<Field label="Date de constitution" required error={err('entity.incorporationDate')}><Text type="date" value={e.incorporationDate} onChange={(v) => set((a) => { a.entity.incorporationDate = v })} /></Field>
    {f('nif', 'NIF (10 chiffres)', true)}{f('businessActivity', 'Activité', true)}{f('physicalAddress', 'Adresse physique', true)}{f('town', 'Ville')}{f('postalBox', 'B.P.')}{f('phone', 'Téléphone')}{f('mobile', 'Mobile')}{f('email', 'E-mail')}{f('website', 'Site web')}{f('annualTurnover', "Chiffre d'affaires annuel")}{f('shareCapital', 'Capital social')}
  </div></Card>
}

function PartiesStep({ d, set, err, customerType, minor }: SP & { customerType: string; minor: boolean }) {
  const add = (role: Person['roles'][number]) => set((a) => { a.people.push(emptyPerson(`p${Date.now().toString(36)}`, role)) })
  const roles = customerType === 'corporate' ? ROLES.filter((r) => r !== 'holder' && r !== 'guardian') : ROLES.filter((r) => r !== 'director' && r !== 'operator')
  return <>
    {minor && <div className="banner warn">Produit Akabirya : le titulaire est mineur. Ajoutez le parent / tuteur (rôle « Tuteur ») et précisez le lien de parenté.</div>}
    {d.people.map((p, i) => { const P = `people.${i}`; const up = (fn: (x: Person) => void) => set((a) => fn(a.people[i])); const f = (k: keyof Person, label: string, req = false, type = 'text') => <Field label={label} required={req} error={err(`${P}.${k}`)}><Text type={type} value={String(p[k] ?? '')} onChange={(v) => up((x) => { (x as any)[k] = v })} /></Field>
      return <div className="party" key={p.id}>
        <div className="party-h"><h3>{p.firstName || p.lastName ? `${p.firstName} ${p.lastName}` : `Partie ${i + 1}`}</h3><span className="spacer" />{d.people.length > 1 && <button type="button" className="danger" onClick={() => set((a) => { a.people.splice(i, 1) })}>Retirer</button>}</div>
        <Field label="Rôles"><div className="chips">{roles.map((r) => <button type="button" key={r} className={`chip ${p.roles.includes(r) ? 'on' : ''}`} onClick={() => up((x) => { x.roles = x.roles.includes(r) ? x.roles.filter((y) => y !== r) : [...x.roles, r] })}>{ROLE_L[r]}</button>)}</div></Field>
        <div className="grid g4">{f('lastName', 'Nom', true)}{f('firstName', 'Prénom(s)', true)}
          <Field label="Sexe"><Select value={p.sex} onChange={(v) => up((x) => { x.sex = v })} options={[['M', 'Masculin'], ['F', 'Féminin']]} /></Field>{f('dateOfBirth', 'Date de naissance', true, 'date')}
          {f('placeOfBirth', 'Lieu de naissance')}{f('nationality', 'Nationalité')}<Field label="État civil"><Select value={p.maritalStatus} onChange={(v) => up((x) => { x.maritalStatus = v })} options={[['single', 'Célibataire'], ['married', 'Marié(e)'], ['widowed', 'Veuf/veuve'], ['divorced', 'Divorcé(e)']]} /></Field>
          <Field label="Type de pièce"><Select value={p.idType} onChange={(v) => up((x) => { x.idType = v as any })} options={[['cni', 'CNI'], ['passport', 'Passeport'], ['driving_licence', 'Permis de conduire'], ['refugee_card', 'Carte de réfugié'], ['birth_certificate', 'Acte de naissance (mineur)']]} /></Field>
          {f('idNumber', 'N° de pièce', true)}{f('idExpiry', "Date d'expiration", p.idType !== 'cni' && p.idType !== 'birth_certificate', 'date')}{f('nif', 'NIF')}
          {customerType === 'corporate' && f('designation', 'Fonction')}{p.roles.includes('beneficial_owner') && f('ownershipPct', '% de détention')}{p.roles.includes('beneficial_owner') && f('votingPct', '% droits de vote')}
          {p.roles.includes('guardian') && f('relationshipToMinor', 'Lien avec le mineur', true)}</div>
        <Check checked={p.pep} onChange={(v) => up((x) => { x.pep = v })} label="Personne politiquement exposée (PPE/PEP) ou proche d'une PPE" />
        {p.pep && <Field label="Détails PPE (fonction, période, lien)" required error={err(`${P}.pepDetails`)}><Text value={p.pepDetails} onChange={(v) => up((x) => { x.pepDetails = v })} /></Field>}
      </div> })}
    <div className="row">{customerType === 'corporate' ? <><button type="button" onClick={() => add('director')}>+ Administrateur</button><button type="button" onClick={() => add('signatory')}>+ Signataire</button><button type="button" onClick={() => add('beneficial_owner')}>+ Bénéficiaire effectif</button></> : <><button type="button" onClick={() => add('holder')}>+ Titulaire</button><button type="button" onClick={() => add('guardian')}>+ Tuteur</button></>}<button type="button" onClick={() => add('mandatee')}>+ Mandataire</button></div>
    {['corporate', 'joint'].includes(customerType) && <Card title="Règle de signature" className="mt"><div className="grid g2">
      <Field label="Mode de signature" required error={err('signing.rule')}><Select value={d.signing.rule} onChange={(v) => set((a) => { a.signing.rule = v as any })} options={[['singly', 'Signature individuelle'], ['jointly', 'Signatures conjointes'], ['either', "L'un ou l'autre"], ['other', 'Autre instruction']]} /></Field>
      {d.signing.rule === 'other' && <Field label="Instructions" error={err('signing.otherInstructions')}><Text value={d.signing.otherInstructions} onChange={(v) => set((a) => { a.signing.otherInstructions = v })} /></Field>}</div>
      {err('people') && <div className="err">{err('people')}</div>}</Card>}
    {allPeopleErr(err)}
  </>
}
const allPeopleErr = (err: SP['err']) => ['people', 'people.holders', 'people.directors', 'people.signatories', 'people.ubo', 'people.guardian'].map((p) => err(p) && <div key={p} className="banner bad">{err(p)}</div>)

function ContactStep({ d, set, err, corporate }: SP & { corporate: boolean }) {
  return <>{d.people.filter((p) => !corporate || p.roles.some((r) => ['signatory', 'director', 'mandatee'].includes(r))).map((p) => { const i = d.people.indexOf(p); const P = `people.${i}`; const up = (fn: (x: Person) => void) => set((a) => fn(a.people[i]))
    const ad = (k: keyof Person['address'], label: string, req = false) => <Field label={label} required={req} error={err(`${P}.address.${k}`)}>{k === 'province' ? <Select value={p.address.province} onChange={(v) => up((x) => { x.address.province = v })} options={PROVINCES.map((x) => [x, x])} /> : <Text value={p.address[k]} onChange={(v) => up((x) => { x.address[k] = v })} />}</Field>
    return <Card key={p.id} title={`${p.firstName} ${p.lastName}`.trim() || `Partie ${i + 1}`}><div className="grid g4">
      <Field label="Mobile (+257…)" required error={err(`${P}.phone`)}><Text inputMode="tel" value={p.phone} onChange={(v) => up((x) => { x.phone = v })} /></Field>
      <Field label="Tél. bureau"><Text value={p.officePhone} onChange={(v) => up((x) => { x.officePhone = v })} /></Field>
      <Field label="E-mail" error={err(`${P}.email`)}><Text type="email" value={p.email} onChange={(v) => up((x) => { x.email = v })} /></Field>{ad('country', 'Pays')}
      {ad('province', 'Province', true)}{ad('commune', 'Commune', true)}{ad('quarter', 'Quartier / Zone', true)}{ad('avenue', 'Avenue / rue & n°')}{ad('town', 'Ville')}{ad('postalBox', 'B.P.')}{ad('residence', 'Résidence / repère')}</div></Card> })}</>
}

function ProfileStep({ d, set, err }: SP) {
  return <div className="grid g2">
    <Card title="Profession (titulaire principal)">{d.people.filter((p) => p.roles.includes('holder') || p.roles.includes('signatory')).slice(0, 4).map((p) => { const i = d.people.indexOf(p); const up = (fn: (x: Person) => void) => set((a) => fn(a.people[i]))
      return <div key={p.id} className="party"><b>{p.firstName} {p.lastName}</b><div className="grid g2" style={{ marginTop: 8 }}>
        <Field label="Profession"><Text value={p.profession} onChange={(v) => up((x) => { x.profession = v })} /></Field><Field label="Poste"><Text value={p.jobTitle} onChange={(v) => up((x) => { x.jobTitle = v })} /></Field>
        <Field label="Employeur" error={err(`people.${i}.employerName`)}><Text value={p.employerName} onChange={(v) => up((x) => { x.employerName = v })} /></Field><Field label="Revenu annuel (BIF)"><Text inputMode="numeric" value={p.annualIncome} onChange={(v) => up((x) => { x.annualIncome = v })} /></Field></div>
        <Check checked={p.selfEmployed} onChange={(v) => up((x) => { x.selfEmployed = v })} label="Indépendant" /></div> })}</Card>
    <div>
      <Card title="Sources de revenus" actions={<button type="button" onClick={() => set((a) => { a.incomeSources.push({ source: 'salary', amount: '' }) })}>+ Ajouter</button>}>
        {d.incomeSources.map((s, i) => <div className="grid g3" key={i}><Select value={s.source} onChange={(v) => set((a) => { a.incomeSources[i].source = v as any })} options={[['salary', 'Salaire'], ['business', 'Activité commerciale'], ['property_sale', 'Vente de biens'], ['other', 'Autre']]} /><Text placeholder="Montant mensuel" value={s.amount} onChange={(v) => set((a) => { a.incomeSources[i].amount = v })} /><button type="button" className="danger" onClick={() => set((a) => { a.incomeSources.splice(i, 1) })}>×</button></div>)}
        {err('incomeSources') && <div className="err">{err('incomeSources')}</div>}
        <Field label="Origine du patrimoine (source of wealth)" required error={err('sourceOfWealth')}><Text value={d.sourceOfWealth} onChange={(v) => set((a) => { a.sourceOfWealth = v })} /></Field>
      </Card>
      <Card title="Comptes dans d'autres banques" actions={<button type="button" onClick={() => set((a) => { a.otherAccounts.push({ accountName: '', bankBranch: '', accountType: '', accountNumber: '' }) })}>+ Ajouter</button>}>
        {d.otherAccounts.map((o, i) => <div className="grid g4" key={i}>{(['bankBranch', 'accountType', 'accountNumber'] as const).map((k) => <Text key={k} placeholder={{ bankBranch: 'Banque / agence', accountType: 'Type', accountNumber: 'N°' }[k]} value={o[k]} onChange={(v) => set((a) => { a.otherAccounts[i][k] = v })} />)}<button type="button" className="danger" onClick={() => set((a) => { a.otherAccounts.splice(i, 1) })}>×</button></div>)}
        {d.otherAccounts.length === 0 && <span className="muted">Aucun</span>}
      </Card>
      <Card title="Introducteur (facultatif)"><div className="grid g2">{(['name', 'finbankAccount', 'phone', 'yearsKnown'] as const).map((k) => <Field key={k} label={{ name: 'Nom', finbankAccount: 'Compte FinBank', phone: 'Téléphone', yearsKnown: 'Connu depuis (années)' }[k]}><Text value={d.introducer[k]} onChange={(v) => set((a) => { a.introducer[k] = v })} /></Field>)}</div></Card>
    </div>
  </div>
}

function DeclStep({ d, set, err }: SP) {
  const dc = d.declarations
  return <div className="grid g2">
    <Card title="Déclarations & consentement (Loi n°1/03 de 2026)">
      <Check checked={dc.actingForSelf} onChange={(v) => set((a) => { a.declarations.actingForSelf = v })} label="Le client agit pour son propre compte" />
      {!dc.actingForSelf && <Field label="Pour le compte de (tiers)" required error={err('declarations.thirdPartyDetails')}><Text value={dc.thirdPartyDetails} onChange={(v) => set((a) => { a.declarations.thirdPartyDetails = v })} /></Field>}
      <Check checked={dc.accuracyConfirmed} onChange={(v) => set((a) => { a.declarations.accuracyConfirmed = v })} label={<>Le client certifie l'exactitude des informations <b className="req">*</b></>} />
      <Check checked={dc.consentDataProcessing} onChange={(v) => set((a) => { a.declarations.consentDataProcessing = v })} label={<>Consentement au traitement des données personnelles (finalités KYC/LBC-FT, conservation légale) <b className="req">*</b></>} />
      <Check checked={dc.consentMarketing} onChange={(v) => set((a) => { a.declarations.consentMarketing = v })} label="Consentement aux communications commerciales (facultatif)" />
      <Check checked={dc.rgoAcknowledged} onChange={(v) => set((a) => { a.declarations.rgoAcknowledged = v })} label={<>Accusé de réception du Règlement Général des Opérations <b className="req">*</b></>} />
      {['declarations.accuracyConfirmed', 'declarations.consentDataProcessing', 'declarations.rgoAcknowledged'].map((p) => err(p) && <div key={p} className="err">{err(p)}</div>)}
    </Card>
    <div>
      <Card title="Source de référence (Ops/CASA)">
        <Field label="Comment le client a-t-il connu FinBank ?" required error={err('referral.source')}><Select value={d.referral.source} onChange={(v) => set((a) => { a.referral.source = v as any })} options={[['staff', 'Personnel FinBank'], ['existing_customer', 'Client existant'], ['agent', 'Agent'], ['walk_in', "Passage en agence"], ['social_media', 'Réseaux sociaux'], ['advertisement', 'Publicité']]} /></Field>
        {d.referral.source === 'staff' && <Field label="Code agent du collaborateur" required error={err('referral.staffCode')}><Text value={d.referral.staffCode} onChange={(v) => set((a) => { a.referral.staffCode = v.toUpperCase() })} /></Field>}
        {['existing_customer', 'agent', 'social_media', 'advertisement'].includes(d.referral.source) && <Field label="Précision"><Text value={d.referral.detail} onChange={(v) => set((a) => { a.referral.detail = v })} /></Field>}
      </Card>
      <Card title="Vérifications par l'agent">
        <Check checked={d.verification.idVerifiedByStaff} onChange={(v) => set((a) => { a.verification.idVerifiedByStaff = v })} label={<>J'ai vérifié l'original de la pièce d'identité et la ressemblance avec le client <b className="req">*</b></>} />
        {err('verification.idVerifiedByStaff') && <div className="err">{err('verification.idVerifiedByStaff')}</div>}
        <Field label="Note de vérification"><Text value={d.verification.idVerifiedNote} onChange={(v) => set((a) => { a.verification.idVerifiedNote = v })} /></Field>
        <Check checked={d.verification.otpPlaceholderVerified} onChange={(v) => set((a) => { a.verification.otpPlaceholderVerified = v })} label="OTP téléphone vérifié (provisoire : fournisseur SMS à intégrer)" />
      </Card>
      <Card title="Exceptions (routées vers Opérations / DG)" actions={<button type="button" onClick={() => set((a) => { a.exceptions.push({ code: 'min_deposit_waiver', reason: '' }) })}>+ Exception</button>}>
        {d.exceptions.map((x, i) => <div className="grid g3" key={i}><Select value={x.code} onChange={(v) => set((a) => { a.exceptions[i].code = v as any })} options={[['min_deposit_waiver', 'Dérogation dépôt minimum'], ['document_deferral', 'Document différé'], ['other', 'Autre']]} /><Text placeholder="Justification" value={x.reason} onChange={(v) => set((a) => { a.exceptions[i].reason = v })} /><button type="button" className="danger" onClick={() => set((a) => { a.exceptions.splice(i, 1) })}>×</button></div>)}
        {d.exceptions.length === 0 && <span className="muted">Aucune</span>}
      </Card>
    </div>
  </div>
}

function ServicesStep({ d, set, err }: SP) {
  const s = d.services; const S = (k: keyof typeof s) => (v: any) => set((a) => { (a.services as any)[k] = v })
  return <div className="grid g2">
    <Card title="Chéquier & virements"><Check checked={s.chequeBook} onChange={S('chequeBook')} label="Chéquier" />
      {s.chequeBook && <div className="grid g2"><Field label="Feuillets"><Select value={s.chequeLeaves} onChange={S('chequeLeaves')} options={[['20', '20'], ['40', '40']]} /></Field><Field label="Nombre de carnets"><Text type="number" value={String(s.chequeBooks)} onChange={(v) => S('chequeBooks')(Number(v))} /></Field></div>}
      <Check checked={s.transferOrderBooklet} onChange={S('transferOrderBooklet')} label="Carnet d'ordres de virement" />
      <Check checked={s.eStatement} onChange={S('eStatement')} label="Relevé électronique (e-statement)" />{s.eStatement && <Field label="E-mail du relevé" required error={err('services.eStatementEmail')}><Text value={s.eStatementEmail} onChange={S('eStatementEmail')} /></Field>}</Card>
    <Card title="Mobile & digital"><Check checked={s.pesaflash} onChange={S('pesaflash')} label="PesaFlash (mobile banking)" />{s.pesaflash && <Field label="Langue PesaFlash"><Select value={s.pesaflashLanguage} onChange={S('pesaflashLanguage')} options={[['fr', 'Français'], ['en', 'English'], ['rn', 'Kirundi']]} /></Field>}
      <Check checked={s.ecocash} onChange={S('ecocash')} label="Lien Ecocash" />{s.ecocash && <><Field label="N° Econet"><Text value={s.econetNumber} onChange={S('econetNumber')} /></Field><Check checked={s.ecocashAgent} onChange={S('ecocashAgent')} label="Agent Ecocash" />{s.ecocashAgent && <Field label="Code agent" required error={err('services.ecocashAgentCode')}><Text value={s.ecocashAgentCode} onChange={S('ecocashAgentCode')} /></Field>}</>}
      <Check checked={s.internetBanking} onChange={S('internetBanking')} label="Internet banking" />
      <Check checked={s.finconnect} onChange={S('finconnect')} label="FinConnect (banque en ligne entreprises / joint)" />{s.finconnect && <Field label="Canal OTP"><Select value={s.finconnectOtpChannel} onChange={S('finconnectOtpChannel')} options={[['mobile', 'Mobile'], ['email', 'E-mail'], ['both', 'Les deux']]} /></Field>}
      <p className="muted" style={{ fontSize: 13 }}>Après ouverture, chaque service est routé vers l'équipe responsable (Digital, Cartes/Chèques…).</p></Card>
  </div>
}

function MandatesStep({ d, set, err }: SP) {
  const opts = d.people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim() || p.id] as [string, string])
  return <div className="grid g2">
    <Card title="Mandataires (lettre de désignation)" actions={<button type="button" onClick={() => set((a) => { a.mandates.push({ personId: '', idNumber: '', noLimit: false, limitAmount: '', limitCurrency: 'BIF', powers: [], otherPower: '' }) })}>+ Mandat</button>}>
      {d.mandates.map((m, i) => <div className="party" key={i}><div className="grid g2"><Field label="Mandataire" error={err(`mandates.${i}.personId`)}><Select value={m.personId} onChange={(v) => set((a) => { a.mandates[i].personId = v })} options={opts} /></Field>
        <Field label="Plafond"><Text value={m.limitAmount} disabled={m.noLimit} onChange={(v) => set((a) => { a.mandates[i].limitAmount = v })} /></Field></div>
        <Check checked={m.noLimit} onChange={(v) => set((a) => { a.mandates[i].noLimit = v })} label="Sans limite" />
        <div className="chips">{(['cash_withdrawal', 'balance_enquiry', 'cheque_book_collection', 'account_history', 'other'] as const).map((pw) => <button type="button" key={pw} className={`chip ${m.powers.includes(pw) ? 'on' : ''}`} onClick={() => set((a) => { const x = a.mandates[i]; x.powers = x.powers.includes(pw) ? x.powers.filter((y) => y !== pw) : [...x.powers, pw] })}>{{ cash_withdrawal: 'Retraits', balance_enquiry: 'Solde', cheque_book_collection: 'Retrait chéquier', account_history: 'Historique', other: 'Autre' }[pw]}</button>)}</div>
        <button type="button" className="danger" style={{ marginTop: 8 }} onClick={() => set((a) => { a.mandates.splice(i, 1) })}>Retirer</button></div>)}
      {d.mandates.length === 0 && <span className="muted">Aucun mandat – la page sera imprimée « Non demandé ».</span>}
    </Card>
    <Card title="Opérateurs FinConnect" actions={<button type="button" onClick={() => set((a) => { a.operators.push({ personId: '', role: 'operator', accounts: [], canInitiate: true, canApprove: false, canView: true, limitAmount: '', limitScope: 'per_transaction' }) })}>+ Opérateur</button>}>
      {!d.services.finconnect && d.operators.length > 0 && <div className="banner bad">FinConnect n'est pas demandé dans Services.</div>}
      {d.operators.map((o, i) => <div className="party" key={i}><div className="grid g3"><Field label="Personne" error={err(`operators.${i}.personId`)}><Select value={o.personId} onChange={(v) => set((a) => { a.operators[i].personId = v })} options={opts} /></Field>
        <Field label="Rôle"><Select value={o.role} onChange={(v) => set((a) => { a.operators[i].role = v as any })} options={[['admin', 'Admin'], ['operator', 'Opérateur'], ['viewer', 'Lecture']]} /></Field><Field label="Plafond"><Text value={o.limitAmount} onChange={(v) => set((a) => { a.operators[i].limitAmount = v })} /></Field></div>
        <div className="row"><Check checked={o.canInitiate} onChange={(v) => set((a) => { a.operators[i].canInitiate = v })} label="Initier" /><Check checked={o.canApprove} onChange={(v) => set((a) => { a.operators[i].canApprove = v })} label="Approuver" /><button type="button" className="danger" onClick={() => set((a) => { a.operators.splice(i, 1) })}>Retirer</button></div></div>)}
      {d.operators.length === 0 && <span className="muted">Aucun</span>}
    </Card>
  </div>
}

function DocsStep({ server, reload, editable, online, people }: { server: any; reload(): void; editable: boolean; online: boolean; people: Person[] }) {
  const { lang } = useSession(); const [e, setE] = useState(''); const [busy, setBusy] = useState<string | null>(null)
  if (!server) return <div className="banner warn">{online ? 'Enregistrez le dossier pour activer le téléversement des documents.' : 'Hors ligne : les documents seront téléversés après synchronisation.'}</div>
  const name = (pid: string | null) => { const p = people.find((x) => x.id === pid); return p ? `${p.firstName} ${p.lastName}` : '' }
  const have = (r: any) => server.documents.filter((x: any) => x.doc_type === r.docType && (r.partyId === null || x.party_id === r.partyId))
  async function up(r: any, f: File | undefined) {
    if (!f) return; setBusy(r.docType + r.partyId); setE('')
    const fd = new FormData(); fd.append('docType', r.docType); fd.append('partyId', r.partyId ?? ''); fd.append('file', f)
    try { await api(`/applications/${server.id}/documents`, { form: fd }); reload() } catch (x: any) { setE(x.body?.error ?? x.message) } finally { setBusy(null) }
  }
  const done = server.requiredDocuments.filter((r: any) => have(r).length).length
  return <Card title={`Checklist documentaire – ${done}/${server.requiredDocuments.length}`} actions={<a className="btn" href="#" onClick={async (ev) => { ev.preventDefault(); const { apiBlob } = await import('../lib/api'); window.open(URL.createObjectURL(await apiBlob(`/applications/${server.id}/pdf`))) }}>{t('pdfPack')}</a>}>
    <div className="banner warn">Imprimez le pack PDF pré-rempli, faites signer le client sur papier, puis scannez le formulaire signé (obligatoire avant approbation). Formats : PDF, JPEG, PNG.</div>
    {e && <div className="banner bad">{e}</div>}
    <Table columns={['Document', 'Partie', 'Fichier(s)', '']} rows={server.requiredDocuments.map((r: any) => [<>{L(r.label, lang) || r.docType}{r.docType === 'signed_form_scan' && <b className="req"> *</b>}</>, name(r.partyId) || '—',
      have(r).length ? have(r).map((x: any) => <div key={x.id}><Badge v="ok" /> {x.file_name} <span className="tag">{(x.size_bytes / 1024).toFixed(0)} Ko</span></div>) : <Badge v="open" />,
      editable && <label className="btn">{busy === r.docType + r.partyId ? '…' : t('upload')}<input type="file" accept="application/pdf,image/jpeg,image/png" capture="environment" hidden onChange={(ev) => up(r, ev.target.files?.[0])} /></label>])} />
  </Card>
}

function ReviewStep({ draft, issues, product, server }: { draft: LocalDraft; issues: Issue[]; product: any; server: any }) {
  const { lang } = useSession(); const d: ApplicationData = draft.data
  const missing = server ? server.requiredDocuments.filter((r: any) => !server.documents.some((x: any) => x.doc_type === r.docType && (r.partyId === null || x.party_id === r.partyId))) : []
  const svc = Object.entries({ Chéquier: d.services.chequeBook, PesaFlash: d.services.pesaflash, Ecocash: d.services.ecocash, 'E-statement': d.services.eStatement, 'Internet banking': d.services.internetBanking, FinConnect: d.services.finconnect }).filter(([, v]) => v).map(([k]) => k)
  return <div className="grid g2">
    <Card title="Résumé"><dl className="kv-list">
      <dt>Client</dt><dd>{draft.customerType === 'corporate' ? d.entity.legalName : d.people.filter((p) => p.roles.includes('holder')).map((p) => `${p.firstName} ${p.lastName}`).join(' & ')}</dd>
      <dt>Produit</dt><dd>{L(product?.names, lang)} · {d.account.currency}</dd><dt>Intitulé</dt><dd>{d.account.accountName}</dd>
      <dt>Parties</dt><dd>{d.people.length} ({d.people.map((p) => p.roles.map((r) => ROLE_L[r]).join('/')).join(', ')})</dd>
      <dt>PEP</dt><dd>{d.people.some((p) => p.pep) ? <Badge v="pep" /> : 'Non'}</dd><dt>Services</dt><dd>{svc.join(', ') || '—'}</dd>
      <dt>Référence</dt><dd>{d.referral.source}{d.referral.staffCode && ` · ${d.referral.staffCode}`}</dd><dt>Exceptions</dt><dd>{d.exceptions.length || 'Aucune'}</dd>
      <dt>Documents</dt><dd>{server ? `${server.requiredDocuments.length - missing.length}/${server.requiredDocuments.length}` : 'non synchronisé'}</dd>
    </dl></Card>
    <Card title={issues.length + missing.length ? `Points bloquants (${issues.length + missing.length})` : 'Prêt pour soumission'}>
      {issues.length + missing.length === 0 ? <div className="banner ok">Toutes les validations sont satisfaites. Le contrôle AML de chaque partie et la notation du risque s'exécutent à la soumission ; le circuit d'approbation est déterminé par les règles de routage.</div>
        : <ul className="issues">{issues.map((i, k) => <li key={k}><span className="err">{i.message}</span> <span className="tag">{i.path}</span></li>)}{missing.map((m: any, k: number) => <li key={'m' + k}><span className="err">Document manquant : {L(m.label, lang) || m.docType}</span></li>)}</ul>}
    </Card>
  </div>
}
