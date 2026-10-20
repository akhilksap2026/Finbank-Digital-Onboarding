import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Field, Table, Text } from '../components/ui'
export default function Risk() {
  const [cfg, setCfg] = useState<any>(null); const [rules, setRules] = useState<any[]>([]); const [msg, setMsg] = useState<any>(null); const [apps, setApps] = useState<any[]>([])
  useEffect(() => { api('/admin/risk-config').then(setCfg); api('/admin/rules').then(setRules); api('/applications').then(setApps) }, [])
  if (!cfg) return <div className="muted">…</div>
  const save = async () => { try { setCfg(await api('/admin/risk-config', { method: 'PUT', body: cfg })); setMsg({ tone: 'ok', text: 'Modèle de risque enregistré (audité)' }) } catch (e: any) { setMsg({ tone: 'bad', text: e.message }) } }
  const dist = ['low', 'medium', 'high'].map((r) => [r, apps.filter((a) => a.risk_rating === r).length])
  return <>
    <div className="page-h"><h1>Notation du risque client</h1><span className="spacer" /><button className="primary" onClick={save}>Enregistrer</button></div>
    {msg && <div className={`banner ${msg.tone}`}>{msg.text}</div>}
    <div className="grid g2">
      <Card title="Pondérations des facteurs"><div className="grid g2">{Object.entries(cfg.weights).map(([k, v]) => <Field key={k} label={k}><Text type="number" value={String(v)} onChange={(x) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: Number(x) } })} /></Field>)}</div></Card>
      <div><Card title="Seuils"><div className="grid g2"><Field label="Moyen ≥"><Text type="number" value={String(cfg.thresholds.medium)} onChange={(x) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, medium: Number(x) } })} /></Field><Field label="Élevé ≥"><Text type="number" value={String(cfg.thresholds.high)} onChange={(x) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, high: Number(x) } })} /></Field></div>
        {cfg.highRiskCountries && <Field label="Pays à haut risque"><Text value={cfg.highRiskCountries.join(', ')} onChange={(x) => setCfg({ ...cfg, highRiskCountries: x.split(',').map((s: string) => s.trim()).filter(Boolean) })} /></Field>}
        {cfg.highRiskActivities && <Field label="Activités à haut risque"><Text value={cfg.highRiskActivities.join(', ')} onChange={(x) => setCfg({ ...cfg, highRiskActivities: x.split(',').map((s: string) => s.trim()).filter(Boolean) })} /></Field>}</Card>
        <Card title="Répartition du portefeuille de dossiers"><Table columns={['Notation', 'Dossiers']} rows={dist} /></Card></div>
    </div>
    <Card title="Règles de routage liées au risque"><Table columns={['Nom', 'Condition', 'Ajoute']} rows={rules.map((r) => [r.name, <code style={{ fontSize: 12.5 }}>{JSON.stringify(r.condition)}</code>, r.add_role])} /></Card>
  </>
}
