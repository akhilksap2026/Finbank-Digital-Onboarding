// Downloads sample filled PDF packs (one corporate, one individual) from a running server into samples/.
import { writeFileSync, mkdirSync } from 'node:fs'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = new URL('../samples/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true })
const tok = (await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'ops1', password: process.env.PW || 'Finbank@2026' }) })).json()).token
const h = { authorization: `Bearer ${tok}` }
const apps = await (await fetch(`${BASE}/api/applications?status=ACCOUNT_OPENED,PENDING_MD`, { headers: h })).json()
for (const [type, name] of [['corporate', 'sample-corporate-pack.pdf'], ['individual', 'sample-individual-pack.pdf']]) {
  const a = apps.find((x) => x.customer_type === type); if (!a) continue
  const r = await fetch(`${BASE}/api/applications/${a.id}/pdf`, { headers: h }); writeFileSync(OUT + name, Buffer.from(await r.arrayBuffer())); console.log(name, a.ref)
}
