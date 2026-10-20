import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { Badge, Card, Table, fmt } from '../components/ui'
import { L } from '../i18n'
export default function Admin() {
  const { lang } = useSession(); const [tab, setTab] = useState('users'); const [users, setUsers] = useState<any[]>([]); const [prods, setProds] = useState<any[]>([]); const [docs, setDocs] = useState<any[]>([]); const [rules, setRules] = useState<any[]>([]); const [h, setH] = useState<any>(null); const [msg, setMsg] = useState('')
  const load = () => { api('/admin/users').then(setUsers); api('/catalog/products').then(setProds); api('/catalog/documents').then(setDocs); api('/admin/rules').then(setRules); api('/admin/integrations').then(setH) }
  useEffect(load, [])
  const toggleProduct = async (p: any) => { await api(`/admin/products/${p.code}`, { method: 'PUT', body: { ...p, active: !p.active } }).then(() => setMsg(`${p.code} mis à jour`)).catch((e) => setMsg(e.message)); load() }
  const toggleRule = async (r: any) => { await api('/admin/rules', { body: { ...r, active: !r.active } }).catch((e) => setMsg(e.message)); load() }
  const tabs = [['users', 'Utilisateurs & rôles'], ['products', 'Produits'], ['documents', 'Documents requis'], ['rules', "Règles d'approbation"], ['integrations', 'Intégrations']]
  return <>
    <div className="page-h"><h1>Administration</h1></div>
    <div className="chips" style={{ marginBottom: 14 }}>{tabs.map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
    {msg && <div className="banner ok">{msg}</div>}
    {tab === 'users' && <Card title={`${users.length} utilisateurs (synchronisés depuis AD au login ; rôle = groupe AD)`}><Table columns={['Utilisateur', 'Nom', 'Rôle', 'Agence', 'Code agent', 'Actif', 'Dernière connexion']} rows={users.map((u) => [<b>{u.username}</b>, u.display_name, <span className="badge">{u.role}</span>, u.branch_code, u.staff_code, <Badge v={u.active ? 'active' : 'locked'} />, fmt(u.last_login_at)])} /></Card>}
    {tab === 'products' && <Card title="Catalogue produits (configurable)"><Table columns={['Code', 'Nom', 'Catégorie', 'Clients', 'Devises', 'Dépôt min.', 'Classe Flexcube', 'Règles', '']} rows={prods.map((p) => [<b>{p.code}</b>, L(p.names, lang), p.category, p.customer_types.join(', '), p.currencies.join('/'), Object.entries(p.min_opening).map(([c, v]) => `${v} ${c}`).join(' · '), p.flexcube_account_class, <span className="tag">{JSON.stringify(p.rules)}</span>, <button onClick={() => toggleProduct(p)}>{p.active ? 'Désactiver' : 'Activer'}</button>])} /></Card>}
    {tab === 'documents' && <Card title="Checklist par produit et type de client"><Table columns={['Type client', 'Produit', 'Document', 'Par partie', 'Libellé']} rows={docs.map((d) => [d.customer_type, d.product_code ?? 'tous', <b>{d.doc_type}</b>, d.per_party_role ?? '—', L(d.labels, lang)])} /></Card>}
    {tab === 'rules' && <Card title="Routage : Chef d'agence → (Opérations / Conformité) → DG"><Table columns={['Priorité', 'Nom', 'Condition', 'Ajoute', 'Actif', '']} rows={rules.map((r) => [r.priority, <b>{r.name}</b>, <code style={{ fontSize: 12.5 }}>{JSON.stringify(r.condition)}</code>, <span className="badge orange">{r.add_role}</span>, <Badge v={r.active ? 'active' : 'locked'} />, <button onClick={() => toggleRule(r)}>{r.active ? 'Désactiver' : 'Activer'}</button>])} /></Card>}
    {tab === 'integrations' && <Card title="Intégrations"><Table columns={['Système', 'Mode', 'État', 'Détail']} rows={(h?.systems ?? []).map((s: any) => [<b>{s.name}</b>, s.mode, <Badge v={s.status} />, s.detail])} /></Card>}
  </>
}
