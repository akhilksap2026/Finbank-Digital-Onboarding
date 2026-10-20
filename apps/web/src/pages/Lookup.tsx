import { useState } from 'react'
import { api } from '../lib/api'
import { Badge, Card, Field, Table, Text, fmt } from '../components/ui'
export default function Lookup() {
  const [ref, setRef] = useState(''); const [r, setR] = useState<any>(null); const [q, setQ] = useState(''); const [s, setS] = useState<any>(null); const [e, setE] = useState('')
  return <>
    <div className="page-h"><h1>Suivi client</h1></div>
    <div className="grid g2">
      <Card title="Statut d'un dossier (référence)"><form className="row" onSubmit={async (ev) => { ev.preventDefault(); setE(''); try { setR(await api(`/customers/status/${encodeURIComponent(ref.trim())}`)) } catch { setR(null); setE('Référence introuvable') } }}>
        <Text style={{ maxWidth: 320 }} placeholder="DAO-001-2026-…" value={ref} onChange={setRef} /><button className="primary">Rechercher</button></form>
        {e && <div className="err">{e}</div>}
        {r && <><dl className="kv-list" style={{ marginTop: 12 }}><dt>Client</dt><dd>{r.applicant_name}</dd><dt>Statut</dt><dd><Badge v={r.status} /></dd><dt>Agence</dt><dd>{r.branch_code}</dd><dt>Soumis</dt><dd>{fmt(r.submitted_at)}</dd><dt>Compte</dt><dd>{r.account_number ?? '—'}</dd><dt>Référence</dt><dd>{r.referral_source}</dd></dl>
          <Table columns={['Service', 'Équipe', 'Statut', 'MAJ']} rows={r.services.map((x: any) => [x.title, x.department, <Badge v={x.status} />, fmt(x.updated_at)])} empty="Aucun service" /></>}
      </Card>
      <Card title="Recherche client"><form className="row" onSubmit={async (ev) => { ev.preventDefault(); setS(await api(`/customers/search?q=${encodeURIComponent(q)}`)) }}><Text style={{ maxWidth: 320 }} placeholder="Nom" value={q} onChange={setQ} /><button>Rechercher</button></form>
        {s && <><Table columns={['CIF', 'Nom', 'Agence', 'Risque', 'Revue KYC']} rows={s.customers.map((c: any) => [c.cif, c.full_name, c.branch_code, <Badge v={c.risk_rating} />, c.kyc_next_review?.slice(0, 10)])} />
          <h3 style={{ margin: '12px 0 6px' }}>Dossiers</h3><Table columns={['Réf.', 'Nom', 'Statut']} rows={s.applications.map((a: any) => [a.ref, a.applicant_name, <Badge v={a.status} />])} /></>}
      </Card>
    </div>
  </>
}
