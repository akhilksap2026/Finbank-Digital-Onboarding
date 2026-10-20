import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { listDrafts, type LocalDraft } from '../lib/offline'
import { Bars, Card, Kpi, Table, Badge, fmt } from '../components/ui'
import { t } from '../i18n'

const TITLES: Record<string, string> = { clerk: 'Agent de clientèle', field_agent: 'Agent terrain', branch_head: "Chef d'agence", operations: 'Opérations / CASA', compliance: 'Conformité', md: 'Direction générale', auditor: 'Audit interne', admin: 'Administration', it: 'Informatique', digital: 'Digital / E-banking', cards: 'Cartes / Chèques', customer_service: 'Service clientèle', risk: 'Risques' }
export default function Dashboard() {
  const { session, pending, lastSync, sync } = useSession()
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [drafts, setDrafts] = useState<LocalDraft[]>([])
  const nav = useNavigate(); const role = session!.user.role
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setErr(e.message)); if (role === 'clerk' || role === 'field_agent' || role === 'branch_head') listDrafts().then(setDrafts) }, [])
  const isStatus = (v: any) => typeof v === 'string' && /^[A-Z_]{4,}$|^(open|done|in_progress|escalated|returned|high|medium|low|critical|hit|pep|clear|ok|down|active|locked|wiped|wipe_pending)$/.test(v)
  return <>
    <div className="page-h"><h1>{t('dashboard')}</h1><span className="badge orange">{TITLES[role]}</span><span className="spacer" />
      {(role === 'clerk' || role === 'field_agent' || role === 'branch_head') && <button className="accent" onClick={() => nav('/journey/new')}>+ {t('newApplication')}</button>}</div>
    {err && <div className="banner bad">{err}</div>}
    {(role === 'clerk' || role === 'field_agent') && <div className="banner ok">Cette tablette : {pending} élément(s) {t('pendingSync')} · {drafts.length} brouillon(s) chiffré(s) en local · dernière synchro {lastSync ?? '—'} <button style={{ marginLeft: 12, minHeight: 32 }} onClick={sync}>{t('syncNow')}</button></div>}
    {d && <>
      <div className="kpis">{d.kpis.map((k: any) => <Kpi key={k.key} label={k.label} value={k.value} tone={k.tone} />)}</div>
      {drafts.filter((x) => !x.serverId).length > 0 && <Card title="Brouillons hors ligne (non encore synchronisés)"><Table columns={['Client', 'Type', 'Modifié']} rows={drafts.filter((x) => !x.serverId).map((x) => [x.data?.people?.[0]?.lastName || x.data?.entity?.legalName || '(sans nom)', x.customerType, fmt(x.updatedAt)])} onRow={(i) => nav(`/journey/${drafts.filter((x) => !x.serverId)[i].clientUuid}`)} /></Card>}
      <div className="grid g2">
        {d.tables.map((tb: any) => <Card key={tb.key} title={tb.title} actions={tb.link && <a href={tb.link} onClick={(e) => { e.preventDefault(); nav(tb.link) }}>Ouvrir →</a>}>
          <Table columns={tb.columns} rows={tb.rows.map((r: any[]) => r.map((c) => (isStatus(c) ? <Badge v={c} /> : c ?? '—')))} />
        </Card>)}
        {d.bars.map((b: any) => <Bars key={b.key} title={b.title} items={b.items} />)}
      </div>
    </>}
  </>
}
