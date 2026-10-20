import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Badge, Card, Table, fmt } from '../components/ui'
export default function ItPage() {
  const [dev, setDev] = useState<any[]>([]); const [h, setH] = useState<any>(null); const [logs, setLogs] = useState<any>({ errors: [], integrations: [] }); const [cfg, setCfg] = useState<any>(null); const [msg, setMsg] = useState('')
  const load = () => { api('/it/devices').then(setDev); api('/admin/integrations').then(setH); api('/it/logs').then(setLogs); api('/it/config').then(setCfg) }
  useEffect(load, [])
  const cmd = async (id: string, c: string) => { if (c === 'wipe' && !confirm('Effacer toutes les données locales de cet appareil à la prochaine connexion ?')) return; await api(`/it/devices/${id}/${c}`, { body: {} }); load() }
  const job = async (j: string) => { const r = await api(`/it/jobs/${j}`, { body: {} }); setMsg(`${j}: ${JSON.stringify(r)}`); load() }
  return <>
    <div className="page-h"><h1>Informatique</h1><span className="spacer" /><button onClick={() => job('retry-core')}>Relancer Flexcube (échecs)</button><button onClick={() => job('kyc-refresh')}>Lancer job revue KYC</button></div>
    {msg && <div className="banner ok">{msg}</div>}
    <div className="grid g2">
      <Card title={`Santé des intégrations ${h ? `(${h.checkedInMs} ms)` : ''}`}><Table columns={['Système', 'Mode', 'État', 'Détail']} rows={(h?.systems ?? []).map((s: any) => [<b>{s.name}</b>, s.mode, <Badge v={s.status} />, <span className="tag">{s.detail}</span>])} /></Card>
      <Card title="Configuration (lecture)"><dl className="kv-list">{cfg && Object.entries(cfg).map(([k, v]) => <><dt key={k}>{k}</dt><dd key={k + 'v'}>{String(v ?? '—')}</dd></>)}</dl></Card>
    </div>
    <Card title="Parc de tablettes & synchronisation"><Table columns={['Appareil', 'Libellé', 'Utilisateur', 'Agence', 'Statut', 'En attente', 'Dernière synchro', 'GPS', '']} rows={dev.map((d) => [<b>{d.device_id}</b>, d.label, d.user_name, d.branch_code, <Badge v={d.status} />, d.pending_items, fmt(d.last_sync_at), d.last_gps ? `${Number(d.last_gps.lat).toFixed(3)}, ${Number(d.last_gps.lng).toFixed(3)}` : '—',
      <div className="row">{d.status === 'active' ? <button onClick={() => cmd(d.device_id, 'lock')}>Verrouiller</button> : <button onClick={() => cmd(d.device_id, 'unlock')}>Réactiver</button>}{d.status !== 'wiped' && <button className="danger" onClick={() => cmd(d.device_id, 'wipe')}>Effacer</button>}</div>])} /></Card>
    <div className="grid g2">
      <Card title="Journal des intégrations"><Table columns={['Date', 'Système', 'Opération', 'Statut', 'Dossier', 'Erreur']} rows={logs.integrations.slice(0, 25).map((l: any) => [fmt(l.at), l.system, l.operation, <Badge v={l.status === 'success' ? 'ok' : 'down'} />, l.ref, <span className="tag">{l.error}</span>])} /></Card>
      <Card title="Journal des erreurs"><Table columns={['Date', 'Source', 'Message']} rows={logs.errors.slice(0, 25).map((l: any) => [fmt(l.at), l.source, <span className="tag">{l.message}</span>])} empty="Aucune erreur" /></Card>
    </div>
  </>
}
