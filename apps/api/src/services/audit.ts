import crypto from 'node:crypto'
import type pg from 'pg'
import { pool } from '../db/pool'

export interface Actor { id: string | null; name: string; role: string; branch?: string | null; ip?: string }
const GENESIS = '0'.repeat(64)
/** Canonical JSON (sorted keys) so the hash survives JSONB key re-ordering. */
export function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  return '{' + Object.keys(v as object).sort().filter((k) => (v as any)[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon((v as any)[k])).join(',') + '}'
}

/** Append a hash-chained audit event. Serialised with an advisory lock so the chain is linear. */
export async function audit(actor: Actor, action: string, entity: string, entityId: string | null, detail: Record<string, unknown> = {}, client?: pg.PoolClient) {
  const c = client ?? (await pool.connect())
  const own = !client
  try {
    if (own) await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(424242)')
    const prev = (await c.query('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1')).rows[0]?.hash ?? GENESIS
    const at = new Date().toISOString()
    detail = JSON.parse(JSON.stringify(detail))
    const payload = canon({ at, actor: actor.id, action, entity, entityId, detail, prev })
    const hash = crypto.createHash('sha256').update(payload).digest('hex')
    await c.query(
      `INSERT INTO audit_events (at, actor_id, actor_name, actor_role, action, entity, entity_id, branch_code, ip, detail, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [at, actor.id, actor.name, actor.role, action, entity, entityId, actor.branch ?? null, actor.ip ?? null, detail, prev, hash],
    )
    if (own) await c.query('COMMIT')
  } catch (e) { if (own) await c.query('ROLLBACK'); throw e } finally { if (own) c.release() }
}

/** Recompute the chain; returns first broken id or null. */
export async function verifyChain(): Promise<{ ok: boolean; checked: number; brokenAt: number | null }> {
  const rows = (await pool.query('SELECT * FROM audit_events ORDER BY id')).rows
  let prev = GENESIS
  for (const r of rows) {
    const at = new Date(r.at).toISOString()
    const payload = canon({ at, actor: r.actor_id, action: r.action, entity: r.entity, entityId: r.entity_id, detail: r.detail, prev })
    const h = crypto.createHash('sha256').update(payload).digest('hex')
    if (r.prev_hash !== prev || r.hash !== h) return { ok: false, checked: rows.length, brokenAt: Number(r.id) }
    prev = r.hash
  }
  return { ok: true, checked: rows.length, brokenAt: null }
}
