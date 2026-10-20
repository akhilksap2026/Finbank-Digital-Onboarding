import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { Badge, Card, Field, Kpi, Table, Text, fmt } from '../components/ui'
import { L } from '../i18n'

const INPUT_L: Record<string, string> = { note: 'Note / justification', cif: 'CIF Flexcube', accountNumber: 'N° de compte', reference: 'Référence', msisdn: 'N° mobile', serial: 'N° de série', userId: 'Identifiant utilisateur' }
export default function Workspace() {
  const { dept } = useParams(); const { lang, can } = useSession(); const nav = useNavigate()
  const [w, setW] = useState<any>(null); const [sel, setSel] = useState<any>(null); const [inp, setInp] = useState<Record<string, string>>({}); const [msg, setMsg] = useState<any>(null); const [filter, setFilter] = useState('')
  const load = () => api(`/workspaces/${dept}/tasks`).then((r) => { setW(r); setSel((s: any) => s && r.tasks.find((x: any) => x.id === s.id)) }).catch((e) => setMsg({ tone: 'bad', text: e.status === 403 ? 'Accès refusé à ce département' : e.message }))
  useEffect(() => { setSel(null); load() }, [dept])
  if (!w) return <div className="muted">{msg?.text ?? '…'}</div>
  async function act(a: any) {
    const { note = '', ...data } = inp
    try { await api(`/workspaces/tasks/${sel.id}/action`, { body: { action: a.key, note, data } }); setMsg({ tone: 'ok', text: `${a.label} ✓` }); setInp({}); load() }
    catch (e: any) { setMsg({ tone: 'bad', text: e.body?.error ?? e.message }) }
  }
  const types = [...new Set(w.tasks.map((x: any) => x.type))] as string[]
  const tasks = w.tasks.filter((x: any) => !filter || x.type === filter)
  const needs = [...new Set(w.department.actions.flatMap((a: any) => a.requires ?? []))] as string[]
  return <>
    <div className="page-h"><h1>{L(w.department.name, lang)}</h1><span className="badge">SLA {w.department.slaHours} h</span><span className="spacer" />
      {dept === 'audit' && can('audit.findings') && <button className="accent" onClick={async () => { const r = await api('/workspaces/audit/sample', { body: { size: 5 } }); setMsg({ tone: 'ok', text: `${r.sampled} dossiers échantillonnés` }); load() }}>Tirer un échantillon</button>}</div>
    {msg && <div className={`banner ${msg.tone}`}>{msg.text}</div>}
    <div className="kpis"><Kpi label="Tâches ouvertes" value={w.kpi.open} tone="orange" /><Kpi label="SLA dépassé" value={w.kpi.breached} tone="red" /><Kpi label="Clôturées (24 h)" value={w.kpi.done_today} tone="green" /><Kpi label="Délai moyen (h)" value={w.kpi.avg_hours} /></div>
    <div className="grid g2" style={{ gridTemplateColumns: sel ? '1.4fr 1fr' : '1fr' }}>
      <Card title="File d'attente" actions={<select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="">Tous types</option>{types.map((x) => <option key={x}>{x}</option>)}</select>}>
        <Table columns={['Tâche', 'Type', 'Dossier', 'Priorité', 'Statut', 'Échéance']} rows={tasks.map((x: any) => [x.title, <span className="tag">{x.type}</span>, x.ref ?? '—', <Badge v={x.priority} />, <Badge v={x.status} />, <span className={x.sla_due_at && new Date(x.sla_due_at) < new Date() ? 'err' : ''}>{fmt(x.sla_due_at)}</span>])} onRow={(i) => { setSel(tasks[i]); setInp({}) }} empty="File vide" />
      </Card>
      {sel && <Card title={sel.title} actions={<button onClick={() => setSel(null)}>×</button>}>
        <dl className="kv-list"><dt>Type</dt><dd>{sel.type}</dd><dt>Statut</dt><dd><Badge v={sel.status} /></dd><dt>Dossier</dt><dd>{sel.ref ? <a href="#" onClick={(e) => { e.preventDefault(); if (can('app.read.all')) nav(`/applications/${sel.application_id}`) }}>{sel.ref}</a> : '—'} {sel.applicant_name}</dd>
          <dt>Compte</dt><dd>{sel.account_number ?? '—'}</dd><dt>Assigné</dt><dd>{sel.assignee ?? '—'}</dd></dl>
        {sel.payload && Object.keys(sel.payload).length > 0 && <pre style={{ background: '#F7F9FC', padding: 10, borderRadius: 8, fontSize: 12.5, overflow: 'auto', maxHeight: 180 }}>{JSON.stringify(sel.payload, null, 2)}</pre>}
        {!['done', 'rejected'].includes(sel.status) && <>{needs.map((k) => <Field key={k} label={INPUT_L[k] ?? k}>{k === 'note' ? <textarea value={inp[k] ?? ''} onChange={(e) => setInp({ ...inp, [k]: e.target.value })} /> : <Text value={inp[k]} onChange={(v) => setInp({ ...inp, [k]: v })} />}</Field>)}
          <div className="row">{w.department.actions.map((a: any) => <button key={a.key} className={a.to === 'done' ? 'primary' : ['escalated', 'str_flagged', 'rejected'].includes(a.to) ? 'danger' : ''} onClick={() => act(a)} title={(a.requires ?? []).join(', ')}>{a.label}</button>)}</div></>}
        <h3 style={{ margin: '14px 0 6px' }}>Historique</h3><Table columns={['Date', 'Par', 'Action', 'Note']} rows={(sel.history || []).map((h: any) => [fmt(h.at), h.by, h.action, h.note])} />
      </Card>}
    </div>
  </>
}
