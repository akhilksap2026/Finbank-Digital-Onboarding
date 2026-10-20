import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Lang, Role } from '../../../../packages/shared/domain'
import { api, setOnUnauthorized, setToken } from './api'
import { hasPin, isUnlocked, lockKey, wipeAll } from './offline'
import { getLang, setLang as storeLang } from '../i18n'
import { syncNow } from './sync'
import { queue } from './offline'

export interface User { id: string; username: string; displayName: string; role: Role; branch: string | null; staffCode: string | null }
interface Session { token: string; user: User; permissions: string[]; departments: string[]; authMode: string }
interface Ctx {
  session: Session | null; lang: Lang; setLang(l: Lang): void; locked: boolean; needsPin: boolean; online: boolean; pending: number; lastSync: string | null; notice: string | null
  login(s: Session): Promise<void>; logout(): void; lock(): void; unlocked(): void; can(p: string): boolean; refreshQueue(): Promise<void>; sync(): Promise<void>
}
const C = createContext<Ctx>(null as any)
export const useSession = () => useContext(C)
const AUTO_LOCK_MS = Number(import.meta.env.VITE_AUTO_LOCK_MS || 5 * 60_000)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => { const s = sessionStorage.getItem('fb.session'); return s ? JSON.parse(s) : null })
  const [lang, setL] = useState<Lang>(getLang())
  const [locked, setLocked] = useState(!!session && !isUnlocked())
  const [needsPin, setNeedsPin] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number>()
  if (session) setToken(session.token)

  const logout = useCallback(() => { lockKey(); setToken(null); sessionStorage.removeItem('fb.session'); setSession(null); setLocked(false) }, [])
  const lock = useCallback(() => { lockKey(); setLocked(true) }, [])
  useEffect(() => setOnUnauthorized(logout), [logout])
  const refreshQueue = useCallback(async () => { if (isUnlocked()) setPending((await queue()).length) }, [])
  const sync = useCallback(async () => {
    if (!session || !isUnlocked()) return
    try {
      const r = await syncNow((c) => { if (c === 'wipe') { setNotice('Device wiped by IT / Appareil effacé par l’IT'); logout() } else { setNotice('Device locked by IT / Appareil verrouillé par l’IT'); lock() } })
      if (!r.command) setLastSync(new Date().toLocaleTimeString())
    } catch { /* offline */ }
    await refreshQueue()
  }, [session, logout, lock, refreshQueue])

  useEffect(() => { const on = () => { setOnline(true); sync() }; const off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off) } }, [sync])
  useEffect(() => { if (!session || locked) return; const i = setInterval(sync, 60_000); sync(); return () => clearInterval(i) }, [session, locked, sync])
  // inactivity auto-lock
  useEffect(() => {
    if (!session) return
    const reset = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => lock(), AUTO_LOCK_MS) }
    const evs = ['pointerdown', 'keydown', 'touchstart']; evs.forEach((e) => addEventListener(e, reset)); reset()
    return () => { evs.forEach((e) => removeEventListener(e, reset)); clearTimeout(timer.current) }
  }, [session, lock])

  const value: Ctx = {
    session, lang, locked, needsPin, online, pending, lastSync, notice,
    setLang: (l) => { storeLang(l); setL(l) },
    async login(s) { setToken(s.token); sessionStorage.setItem('fb.session', JSON.stringify(s)); setSession(s); setNotice(null); const has = await hasPin(s.user.username); setNeedsPin(!has); setLocked(true) },
    logout, lock, unlocked: () => { setLocked(false); setNeedsPin(false); refreshQueue() },
    can: (p) => !!session?.permissions.includes(p), refreshQueue, sync,
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
export { wipeAll, api }
