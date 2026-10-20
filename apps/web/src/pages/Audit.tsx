import { useEffect, useState } from 'react'
import { api, apiBlob } from '../lib/api'
import { useSession } from '../lib/session'
import { Card, Field, Table, Text, Badge, fmt } from '../components/ui'
export default function Audit() {
  const { can } = useSession(); const [f, setF] = useState({ q: '', action: '', entityId: '', from: '', to: '' }); const [rows, setRows] = useState<any[]>([]); const [v, setV] = useState<any>(null)
  const qs = () => new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, x]) => x)))
  const load = () => api(`/audit?${qs()}`).then(setRows)
  useEffect(() => { load(); api('/audit/verify').then(setV) }, [])
  return <>
    <div className="page-h"><h1>Piste d'audit</h1><span className="badge grey">lecture seule · append-only</span>{v && <Badge v={v.ok ? 'ok' : 'down'} />}{v && <span className="tag">chaîne SHA-256 {v.ok ? 'intègre' : `rompue à #${v.brokenAt}`} · {v.checked} évènements</span>}<span className="spacer" />
      {can('audit.export') && <button onClick={async () => { const b = await apiBlob(`/audit?${qs()}&format=csv&limit=5000`); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'audit-trail.csv'; a.click() }}>Exporter CSV</button>}</div>
    <Card><form className="grid g4" onSubmit={(e) => { e.preventDefault(); load() }}>
      <Field label="Texte / acteur"><Text value={f.q} onChange={(x) => setF({ ...f, q: x })} /></Field><Field label="Action (préfixe)"><Text placeholder="application." value={f.action} onChange={(x) => setF({ ...f, action: x })} /></Field>
      <Field label="Du"><Text type="date" value={f.from} onChange={(x) => setF({ ...f, from: x })} /></Field><Field label="Au"><Text type="date" value={f.to} onChange={(x) => setF({ ...f, to: x })} /></Field>
      <button className="primary">Rechercher</button></form></Card>
    <Card title={`${rows.length} évènements`}><Table columns={['#', 'Date', 'Acteur', 'Rôle', 'Action', 'Objet', 'Agence', 'Détail', 'Hash']} rows={rows.map((r) => [r.id, fmt(r.at), r.actor_name, r.actor_role, <b>{r.action}</b>, `${r.entity}${r.entity_id ? ` ${String(r.entity_id).slice(0, 8)}` : ''}`, r.branch_code ?? '', <span className="tag">{JSON.stringify(r.detail).slice(0, 90)}</span>, <span className="tag">{r.hash.slice(0, 10)}</span>])} /></Card>
  </>
}
