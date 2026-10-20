import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = [path.join(here, 'migrations'), path.join(here, '../src/db/migrations'), path.resolve('src/db/migrations')].find((d) => fs.existsSync(d))!

export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    const c = await pool.connect()
    try { await c.query('BEGIN'); await c.query(sql); await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]); await c.query('COMMIT'); console.log('applied', f) }
    catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
  }
}
if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1) })
