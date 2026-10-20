import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Badge, Card, Table, fmt } from '../components/ui'
import { STATUS, L, t } from '../i18n'

export default function Applications({ pendingForMe }: { pendingForMe?: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(''); const [st, setSt] = useState(''); const nav = useNavigate()
  const load = () => api(`/applications?${new URLSearchParams({ ...(pendingForMe ? { pendingFor: 'me' } : {}), ...(q ? { q } : {}), ...(st ? { status: st } : {}) })}`).then(setRows)
  useEffect(() => { load() }, [pendingForMe, st])
  return <>
    <div className="page-h"><h1>{pendingForMe ? t('approvals') : t('applications')}</h1><span className="badge">{rows.length}</span></div>
    <Card>
      <form className="row" onSubmit={(e) => { e.preventDefault(); load() }} style={{ marginBottom: 12 }}>
        <input style={{ maxWidth: 340 }} placeholder="Nom ou référence…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!pendingForMe && <select style={{ maxWidth: 240 }} value={st} onChange={(e) => setSt(e.target.value)}><option value="">Tous statuts</option>{Object.keys(STATUS).map((s) => <option key={s} value={s}>{L(STATUS[s])}</option>)}</select>}
        <button>{t('search')}</button>
      </form>
      <Table columns={['Réf.', 'Client', 'Type', 'Produit', 'Agence', t('status'), 'Risque', 'AML', 'Échéance SLA', 'Créé par']}
        rows={rows.map((r) => [<b>{r.ref}</b>, r.applicant_name, `${r.customer_type}${r.kind !== 'new_customer' ? ` · ${r.kind}` : ''}`, r.product_code, r.branch_code, <Badge v={r.status} />, <Badge v={r.risk_rating} />, <Badge v={r.aml_status} />, r.sla_due_at ? <span className={new Date(r.sla_due_at) < new Date() ? 'err' : ''}>{fmt(r.sla_due_at)}</span> : '—', r.created_by_name])}
        onRow={(i) => nav(['DRAFT', 'RETURNED'].includes(rows[i].status) && !pendingForMe ? `/journey/${rows[i].id}` : `/applications/${rows[i].id}`)} empty="Aucun dossier" />
    </Card>
  </>
}
