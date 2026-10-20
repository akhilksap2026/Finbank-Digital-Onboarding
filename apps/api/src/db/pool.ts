import pg from 'pg'
import { config } from '../config'
pg.types.setTypeParser(1082, (v) => v) // DATE as string
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })
export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> { const r = await pool.query(text, params); return r.rows as T[] }
export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> { return (await q<T>(text, params))[0] }
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r } catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
}
