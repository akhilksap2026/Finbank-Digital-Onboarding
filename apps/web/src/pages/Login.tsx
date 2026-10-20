import { useEffect, useState } from 'react'
import { api, deviceId } from '../lib/api'
import { useSession } from '../lib/session'
import { setPin, unlock, wipeAll } from '../lib/offline'
import { t } from '../i18n'
import type { Lang } from '../../../../packages/shared/domain'

export default function Login() {
  const { login, lang, setLang, notice } = useSession()
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [mode, setMode] = useState<any>(null)
  useEffect(() => { api('/auth/mode').then(setMode).catch(() => {}) }, [])
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try { await login(await api('/auth/login', { body: { username: u.trim(), password: p, deviceId: deviceId(), deviceLabel: /iPad|Android|Tablet/i.test(navigator.userAgent) ? 'Tablet' : 'Browser' } })) }
    catch (x: any) { setErr(x.status === 401 ? 'Identifiants invalides / Invalid credentials' : x.status === 423 ? 'Appareil verrouillé par l’IT / Device locked by IT' : x.status === 429 ? 'Trop de tentatives / Too many attempts' : 'Serveur injoignable / Server unreachable') }
    finally { setBusy(false) }
  }
  return <div className="login"><form className="box" onSubmit={go}>
    <div className="row"><img src="/logo.png" alt="FinBank" /><span className="spacer" />
      <select style={{ width: 90 }} value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="fr">FR</option><option value="en">EN</option><option value="rn">RN</option></select></div>
    <h1 style={{ margin: '18px 0 4px' }}>{t('appName')}</h1>
    <p className="muted" style={{ marginTop: 0 }}>Active Directory · {mode?.mode === 'mock' ? 'mode démo' : 'LDAP'}</p>
    {notice && <div className="banner bad">{notice}</div>}
    <label className="field"><span className="lbl">{t('username')}</span><input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></label>
    <label className="field"><span className="lbl">{t('password')}</span><input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
    {err && <div className="banner bad">{err}</div>}
    <button className="primary" style={{ width: '100%' }} disabled={busy || !u || !p}>{t('login')}</button>
    {mode?.mode === 'mock' && <p className="muted" style={{ fontSize: 13 }}>Démo : clerk1, agent1, bh1, ops1, comp1, md1, audit1, admin1, it1, digital1, cards1, cs1, risk1 · mot de passe {mode.mockPasswordHint}</p>}
  </form></div>
}

export function PinScreen() {
  const { session, needsPin, unlocked, logout } = useSession()
  const [pin, setP] = useState(''); const [first, setFirst] = useState<string | null>(null); const [err, setErr] = useState(''); const [tries, setTries] = useState(0)
  const user = session!.user.username
  async function done(v: string) {
    if (needsPin) {
      if (!first) { setFirst(v); setP(''); return }
      if (first !== v) { setErr('Les PIN ne correspondent pas / PINs do not match'); setFirst(null); setP(''); return }
      await setPin(user, v); unlocked(); return
    }
    if (await unlock(user, v)) return unlocked()
    const n = tries + 1; setTries(n); setP(''); setErr(`PIN incorrect (${n}/5)`)
    if (n >= 5) { await wipeAll(); logout() } // too many attempts: local encrypted data destroyed
  }
  const press = (d: string) => { const v = (pin + d).slice(0, 6); setP(v); setErr(''); if (v.length === 6) done(v) }
  return <div className="login"><div className="box" style={{ textAlign: 'center' }}>
    <img src="/logo.png" alt="FinBank" />
    <h2 style={{ marginTop: 14 }}>{session!.user.displayName}</h2>
    <p className="muted">{needsPin ? (first ? 'Confirmez le PIN / Confirm PIN' : t('setPin')) : t('enterPin')}</p>
    <div className="pindots">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={i < pin.length ? 'f' : ''} />)}</div>
    {err && <div className="banner bad">{err}</div>}
    <div className="pinpad">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
      <button onClick={logout} style={{ fontSize: 14 }}>{t('logout')}</button><button onClick={() => press('0')}>0</button><button onClick={() => setP(pin.slice(0, -1))}>⌫</button></div>
  </div></div>
}
