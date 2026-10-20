import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, apiBlob } from '../lib/api'
import { useSession } from '../lib/session'
import { Badge, Card, Field, Table, Text, fmt } from '../components/ui'
import { L, t } from '../i18n'
import { PENDING_STATUS_BY_ROLE } from '../../../../packages/shared/domain'

const STEP_L: Record<string, string> = { branch_head: "Chef d'agence", operations: 'Opérations', compliance: 'Conformité', md: 'DG' }
export default function AppDetail() {
  const { id } = useParams(); const nav = useNavigate(); const { session, can, lang } = useSession()
  const [a, setA] = useState<any>(null); const [comment, setComment] = useState(''); const [msg, setMsg] = useState<any>(null); const [mo, setMo] = useState({ cif: '', accountNumber: '' }); const [pdf, setPdf] = useState<string | null>(null)
  const load = () => api(`/applications/${id}`).then(setA).catch((e) => setMsg({ tone: 'bad', text: e.message }))
  useEffect(() => { load() }, [id])
  if (!a) return <div className="muted">{msg?.text ?? '…'}</div>
  const u = session!.user; const d = a.data
  const myTurn = can('app.approve') && PENDING_STATUS_BY_ROLE[u.role] === a.status && a.created_by !== u.id
  async function decide(decision: string) {
    try { const r = await api(`/applications/${a.id}/decision`, { body: { decision, comment } }); setMsg({ tone: 'ok', text: `Décision enregistrée → ${r.status}` }); setComment(''); load() }
    catch (e: any) { setMsg({ tone: 'bad', text: ({ comment_required: 'Commentaire obligatoire pour retour/rejet', maker_checker: 'Maker-checker : vous ne pouvez pas approuver votre propre dossier', open_compliance_cases: 'Des cas conformité sont encore ouverts', missing_signed_scan: 'Scan du formulaire signé manquant' } as any)[e.body?.error] ?? e.body?.error ?? e.message }) }
  }
  async function showPdf() { setPdf(URL.createObjectURL(await apiBlob(`/applications/${a.id}/pdf`))) }
  const holders = a.customer_type === 'corporate' ? d.entity.legalName : d.people.filter((p: any) => p.roles.includes('holder')).map((p: any) => `${p.firstName} ${p.lastName}`).join(' & ')
  return <>
    <div className="page-h"><h1>{a.ref}</h1><Badge v={a.status} /><span className="tag">{a.customer_type} · {a.kind} · {a.product_code} · {a.branch_code}</span><span className="spacer" />
      {['DRAFT', 'RETURNED'].includes(a.status) && a.created_by === u.id && <button onClick={() => nav(`/journey/${a.id}`)}>Modifier</button>}
      {can('pdf.generate') && <button onClick={showPdf}>{t('pdfPack')}</button>}</div>
    {msg && <div className={`banner ${msg.tone}`}>{msg.text}</div>}
    <div className="grid g2">
      <Card title={holders}>
        <dl className="kv-list"><dt>Circuit</dt><dd><div className="chain">{(a.approval_chain || []).map((r: string, i: number) => <span key={r} className={i < a.chain_index ? 'ok' : i === a.chain_index && a.status.startsWith('PENDING') ? 'cur' : ''}>{STEP_L[r] ?? r}</span>)}</div></dd>
          <dt>Risque</dt><dd><Badge v={a.risk_rating} /> {a.risk_score != null && `score ${a.risk_score}`} <span className="tag">{(a.risk_factors || []).join(', ')}</span></dd>
          <dt>AML</dt><dd><Badge v={a.aml_status} /></dd><dt>SLA</dt><dd>{fmt(a.sla_due_at)}</dd>
          <dt>Flexcube</dt><dd>{a.core_status ?? '—'} {a.cif && `· CIF ${a.cif}`} {a.account_number && `· Compte ${a.account_number}`}</dd>
          <dt>Référence</dt><dd>{d.referral?.source} {d.referral?.staffCode}</dd><dt>Saisie</dt><dd>{a.capture_channel}{a.gps && ` · GPS ${Number(a.gps.lat).toFixed(4)}, ${Number(a.gps.lng).toFixed(4)}`}</dd>
          <dt>Exceptions</dt><dd>{d.exceptions?.map((x: any) => `${x.code}: ${x.reason}`).join('; ') || 'Aucune'}</dd></dl>
      </Card>
      <Card title="Décision">
        {myTurn ? <><Field label={t('comment')} hint="Obligatoire pour retour ou rejet"><textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <div className="row"><button className="primary" onClick={() => decide('approve')}>{t('approve')}</button><button onClick={() => decide('return')}>{t('returnApp')}</button><button className="danger" onClick={() => decide('reject')}>{t('reject')}</button></div></>
          : <p className="muted">{a.status.startsWith('PENDING') ? `En attente : ${STEP_L[(a.approval_chain || [])[a.chain_index]] ?? ''}${a.created_by === u.id ? ' (vous êtes le maker)' : ''}` : 'Aucune action requise.'}</p>}
        {a.status === 'FALLBACK_MANUAL' && can('core.manual_open') && <div className="party" style={{ marginTop: 12 }}><b>Ouverture manuelle Flexcube (fallback)</b><p className="muted" style={{ fontSize: 14 }}>La création via la passerelle a échoué. Ouvrez dans Flexcube (fiche pré-remplie dans le PDF) puis saisissez les identifiants.</p>
          <div className="grid g2"><Field label="CIF"><Text value={mo.cif} onChange={(v) => setMo({ ...mo, cif: v })} /></Field><Field label="N° de compte"><Text value={mo.accountNumber} onChange={(v) => setMo({ ...mo, accountNumber: v })} /></Field></div>
          <div className="row"><button className="primary" disabled={!mo.cif || !mo.accountNumber} onClick={async () => { await api(`/applications/${a.id}/manual-open`, { body: mo }); load() }}>Confirmer l'ouverture</button><button onClick={async () => { await api(`/applications/${a.id}/retry-core`, { body: {} }).catch(() => {}); load() }}>Réessayer Flexcube</button></div></div>}
      </Card>
    </div>
    <div className="grid g2">
      <Card title="Parties & filtrage AML"><Table columns={['Nom', 'Rôles', 'Pièce', 'PEP', 'AML']} rows={d.people.map((p: any) => { const s = a.screenings.filter((x: any) => x.party_id === p.id).slice(-1)[0]; return [`${p.firstName} ${p.lastName}`, p.roles.join(', '), `${p.idType} ${p.idNumber}`, p.pep ? <Badge v="pep" /> : 'Non', <Badge v={s?.result} />] })} /></Card>
      <Card title={`${t('documents')} (${a.documents.length})`}><Table columns={['Type', 'Fichier', 'SHA-256', 'QA']} rows={a.documents.map((x: any) => [x.doc_type, <a href="#" onClick={async (e) => { e.preventDefault(); window.open(URL.createObjectURL(await apiBlob(`/applications/${a.id}/documents/${x.id}`))) }}>{x.file_name}</a>, <span className="tag">{x.sha256.slice(0, 12)}…</span>, <Badge v={x.qa_status} />])} /></Card>
      <Card title="Historique des approbations"><Table columns={['Date', 'Étape', 'Décision', 'Par', 'Commentaire']} rows={a.approvals.map((x: any) => [fmt(x.at), STEP_L[x.step_role] ?? x.step_role, <Badge v={x.decision === 'approve' ? 'done' : x.decision === 'reject' ? 'rejected' : 'returned'} />, x.actor_name, x.comment])} empty="—" /></Card>
      <Card title="Tâches départements"><Table columns={['Département', 'Tâche', 'Statut', 'SLA']} rows={a.tasks.map((x: any) => [x.department, x.title, <Badge v={x.status} />, fmt(x.sla_due_at)])} /></Card>
    </div>
    {pdf && <Card title={t('pdfPack')} actions={<><a className="btn" href={pdf} download={`${a.ref}.pdf`}>Télécharger</a><button onClick={() => setPdf(null)}>×</button></>}><iframe title="pdf" src={pdf} style={{ width: '100%', height: '80vh', border: 0 }} /></Card>}
  </>
}
