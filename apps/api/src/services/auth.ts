import jwt from 'jsonwebtoken'
import { Client } from 'ldapts'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config'
import { one } from '../db/pool'
import { can, type Permission } from '../rbac'
import type { Role } from '../../../../packages/shared/domain'

export interface SessionUser { id: string; username: string; displayName: string; role: Role; branch: string | null; staffCode: string | null }
declare global { namespace Express { interface Request { user?: SessionUser; deviceId?: string } } }

export const MOCK_PASSWORD = 'Finbank@2026'

/** Authenticate against Active Directory (LDAP bind) or the dev mock. Role comes from AD groups when mapped, else from the local user record. */
export async function authenticate(username: string, password: string): Promise<SessionUser | null> {
  const local = await one('SELECT * FROM users WHERE lower(username)=lower($1) AND active', [username])
  let role: Role | undefined = local?.role
  if (config.authMode === 'mock') {
    if (!local || password !== MOCK_PASSWORD) return null
  } else {
    const client = new Client({ url: config.ldap.url, tlsOptions: { rejectUnauthorized: config.ldap.tlsRejectUnauthorized }, timeout: 8000 })
    try {
      await client.bind(config.ldap.bindDn, config.ldap.bindPassword)
      const filter = config.ldap.userFilter.replace('{{username}}', username.replace(/[*()\\\0]/g, ''))
      const { searchEntries } = await client.search(config.ldap.baseDn, { scope: 'sub', filter, attributes: ['dn', 'memberOf', 'displayName'] })
      const entry = searchEntries[0]
      if (!entry) return null
      const userClient = new Client({ url: config.ldap.url, tlsOptions: { rejectUnauthorized: config.ldap.tlsRejectUnauthorized } })
      try { await userClient.bind(entry.dn, password) } catch { return null } finally { await userClient.unbind().catch(() => {}) }
      const groups = ([] as string[]).concat((entry.memberOf as any) ?? [])
      const map = Object.fromEntries(config.ldap.groupRoleMap.split(',').filter(Boolean).map((p) => p.split('=').map((s) => s.trim())))
      const mapped = groups.map((g) => /CN=([^,]+)/i.exec(g)?.[1]).find((cn) => cn && map[cn])
      if (mapped) role = map[mapped] as Role
      if (!local) return null // users must be provisioned (branch, staff code) by Admin
    } finally { await client.unbind().catch(() => {}) }
  }
  if (!local || !role) return null
  return { id: local.id, username: local.username, displayName: local.display_name, role, branch: local.branch_code, staffCode: local.staff_code }
}

export function sign(u: SessionUser) { return jwt.sign(u, config.jwtSecret, { expiresIn: config.jwtTtl as any }) }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' })
  try {
    const u = jwt.verify(h.slice(7), config.jwtSecret) as SessionUser
    req.user = { id: u.id, username: u.username, displayName: u.displayName, role: u.role, branch: u.branch, staffCode: u.staffCode }
    req.deviceId = String(req.headers['x-device-id'] || '') || undefined
    next()
  } catch { res.status(401).json({ error: 'invalid_token' }) }
}
export const requirePerm = (...perms: Permission[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' })
  if (!perms.some((p) => can(req.user!.role, p))) return res.status(403).json({ error: 'forbidden', need: perms })
  next()
}
export const actorOf = (req: Request) => ({ id: req.user?.id ?? null, name: req.user?.displayName ?? 'anonymous', role: req.user?.role ?? 'none', branch: req.user?.branch, ip: req.ip })
