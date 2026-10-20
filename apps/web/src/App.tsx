import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useSession } from './lib/session'
import { api } from './lib/api'
import { L, t } from './i18n'
import type { Lang } from '../../../packages/shared/domain'
import Login, { PinScreen } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import Journey from './pages/Journey'
import AppDetail from './pages/AppDetail'
import Workspace from './pages/Workspace'
import Audit from './pages/Audit'
import ItPage from './pages/It'
import Admin from './pages/Admin'
import Risk from './pages/Risk'
import Lookup from './pages/Lookup'

export default function App() {
  const s = useSession()
  if (!s.session) return <Login />
  if (s.locked) return <PinScreen />
  return <Shell />
}

function Shell() {
  const { session, lang, setLang, logout, lock, online, pending, sync, lastSync, can } = useSession()
  const [depts, setDepts] = useState<Array<{ key: string; name: any }>>([])
  useEffect(() => { if (can('dept.work')) api('/workspaces').then(setDepts).catch(() => {}) }, [])
  const u = session!.user
  const approver = can('app.approve')
  return <div className="layout">
    <header className="top">
      <img src="/logo.png" alt="FinBank" /><span className="title">{t('appName')}</span><span className="spacer" />
      <span className="net" title={online ? '' : t('offline')}><span className={`dot ${online ? '' : 'off'}`} />{online ? t('online') : 'Offline'}{pending > 0 && ` · ${pending} ${t('pendingSync')}`}</span>
      {can('app.create') && <button onClick={sync} title={lastSync ?? ''}>{t('syncNow')}</button>}
      <select aria-label="Langue" value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="fr">FR</option><option value="en">EN</option><option value="rn">RN</option></select>
      <div className="who"><div><b>{u.displayName}</b></div><div>{u.role.replace('_', ' ')} · {u.branch ?? 'HQ'}</div></div>
      <button onClick={lock}>{t('lock')}</button><button onClick={logout}>{t('logout')}</button>
    </header>
    <nav className="side">
      <NavLink to="/" end>{t('dashboard')}</NavLink>
      {approver && <NavLink to="/approvals">{t('approvals')}</NavLink>}
      {(can('app.read.own') || can('app.read.branch') || can('app.read.all')) && <NavLink to="/applications">{t('applications')}</NavLink>}
      {can('app.create') && <NavLink to="/journey/new">+ {t('newApplication')}</NavLink>}
      {can('customer.lookup_status') && <NavLink to="/lookup">{t('lookup')}</NavLink>}
      {depts.length > 0 && <div className="sec">{t('workspaces')}</div>}
      {depts.map((d) => <NavLink key={d.key} to={`/workspace/${d.key}`}>{L(d.name, lang)}</NavLink>)}
      {(can('audit.read') || can('it.devices') || can('admin.users') || can('risk.config')) && <div className="sec">{t('admin')}</div>}
      {can('audit.read') && <NavLink to="/audit">{t('audit')}</NavLink>}
      {can('it.devices') && <NavLink to="/it">{t('it')}</NavLink>}
      {can('risk.config') && <NavLink to="/risk">{t('risk')}</NavLink>}
      {can('admin.users') && <NavLink to="/admin">{t('admin')}</NavLink>}
    </nav>
    <main>
      {!online && <div className="banner warn">{t('offline')}</div>}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/approvals" element={<Applications pendingForMe />} />
        <Route path="/journey/:id" element={<Journey />} />
        <Route path="/applications/:id" element={<AppDetail />} />
        <Route path="/workspace/:dept" element={<Workspace />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/it" element={<ItPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/risk" element={<Risk />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </main>
  </div>
}
