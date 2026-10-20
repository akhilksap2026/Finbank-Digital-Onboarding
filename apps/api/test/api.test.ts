import { beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { app, login, pool, request, resetDb, uploadAllRequired } from './helpers'
import { sampleCorporate, sampleIndividual } from '../src/db/seed'
import { setMockCoreDown } from '../src/adapters/flexcube'
import { verifyChain } from '../src/services/audit'

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
let clerk: string, bh: string, bhGitega: string, comp: string, ops: string, it_: string, digital: string, auditor: string

async function newApp(token: string, customerType: string, data: any) {
  const r = await request(app).post('/api/applications').set(auth(token)).send({ kind: 'new_customer', customerType, data, productCode: data.account.productCode })
  expect(r.status).toBe(201); return r.body
}
async function ready(token: string, customerType: string, data: any) { const a = await newApp(token, customerType, data); await uploadAllRequired(token, a.id); return a }

beforeAll(async () => {
  await resetDb()
  ;[clerk, bh, bhGitega, comp, ops, it_, digital, auditor] = await Promise.all(['clerk1', 'bh1', 'bh3', 'comp1', 'ops1', 'it1', 'digital1', 'audit1'].map((u) => login(u)))
})

describe('auth & RBAC', () => {
  it('rejects bad credentials and audits the failure', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'clerk1', password: 'nope' })
    expect(r.status).toBe(401)
    const ev = await pool.query(`SELECT 1 FROM audit_events WHERE action='auth.login_failed'`); expect(ev.rowCount).toBeGreaterThan(0)
  })
  it('requires a token', async () => { expect((await request(app).get('/api/applications')).status).toBe(401) })
  it('enforces permissions server-side', async () => {
    expect((await request(app).get('/api/audit').set(auth(clerk))).status).toBe(403)
    expect((await request(app).get('/api/admin/users').set(auth(clerk))).status).toBe(403)
    expect((await request(app).get('/api/workspaces/compliance/tasks').set(auth(digital))).status).toBe(403)
    expect((await request(app).get('/api/workspaces/digital/tasks').set(auth(digital))).status).toBe(200)
    expect((await request(app).get('/api/audit').set(auth(auditor))).status).toBe(200)
  })
})

describe('application lifecycle', () => {
  it('blocks submission when documents or fields are missing', async () => {
    const d = sampleIndividual(); d.verification.idVerifiedByStaff = false
    const a = await newApp(clerk, 'individual', d)
    const r = await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))
    expect(r.status).toBe(422)
    const codes = r.body.issues.map((i: any) => i.code)
    expect(codes).toContain('missing_document'); expect(codes).toContain('required')
    expect(r.body.issues.some((i: any) => i.path.includes('signed_form_scan'))).toBe(true)
  })
  it('opens an account end-to-end with maker-checker and service routing', async () => {
    const a = await ready(clerk, 'individual', sampleIndividual())
    const s = await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))
    expect(s.status).toBe(200); expect(s.body.chain).toEqual(['branch_head'])
    expect((await request(app).post(`/api/applications/${a.id}/decision`).set(auth(clerk)).send({ decision: 'approve' })).status).toBe(403)
    expect((await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bhGitega)).send({ decision: 'approve' })).status).toBe(403)
    const d = await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bh)).send({ decision: 'approve', comment: 'ok' })
    expect(d.body.status).toBe('ACCOUNT_OPENED')
    const full = await request(app).get(`/api/applications/${a.id}`).set(auth(clerk))
    expect(full.body.account_number).toBeTruthy(); expect(full.body.cif).toBeTruthy()
    const types = full.body.tasks.map((t: any) => t.type)
    expect(types).toEqual(expect.arrayContaining(['svc_pesaflash', 'svc_cheque_book', 'svc_estatement', 'document_qa']))
  })
  it('returns are editable and resubmittable; locked otherwise', async () => {
    const a = await ready(clerk, 'individual', sampleIndividual())
    await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))
    expect((await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bh)).send({ decision: 'return' })).status).toBe(422) // comment required
    await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bh)).send({ decision: 'return', comment: 'Fix address' })
    const cur = (await request(app).get(`/api/applications/${a.id}`).set(auth(clerk))).body
    expect(cur.status).toBe('RETURNED')
    const p = await request(app).patch(`/api/applications/${a.id}`).set(auth(clerk)).send({ version: cur.version, data: { sourceOfWealth: 'Héritage' } })
    expect(p.status).toBe(200)
    expect((await request(app).patch(`/api/applications/${a.id}`).set(auth(clerk)).send({ version: cur.version, data: {} })).status).toBe(409) // stale version
    expect((await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))).status).toBe(200)
  })
  it('routes PEPs to compliance and blocks approval while cases are open', async () => {
    const d = sampleIndividual(); d.people[0].pep = true; d.people[0].pepDetails = 'Député'
    const a = await ready(clerk, 'individual', d)
    const s = await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))
    expect(s.body.chain).toContain('compliance')
    await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bh)).send({ decision: 'approve', comment: 'ok' })
    expect((await request(app).post(`/api/applications/${a.id}/decision`).set(auth(comp)).send({ decision: 'approve', comment: 'ok' })).body.error).toBe('open_compliance_cases')
    const tasks = (await request(app).get('/api/workspaces/compliance/tasks').set(auth(comp))).body.tasks.filter((t: any) => t.application_id === a.id)
    for (const t of tasks) {
      const action = t.type === 'edd' ? 'edd_complete' : 'false_positive'
      expect((await request(app).post(`/api/workspaces/tasks/${t.id}/action`).set(auth(comp)).send({ action })).status).toBe(422) // note required
      expect((await request(app).post(`/api/workspaces/tasks/${t.id}/action`).set(auth(comp)).send({ action, note: 'Vérifié' })).status).toBe(200)
    }
    const r = await request(app).post(`/api/applications/${a.id}/decision`).set(auth(comp)).send({ decision: 'approve', comment: 'EDD done' })
    expect(r.body.status).toBe('ACCOUNT_OPENED')
  })
  it('falls back to manual opening when Flexcube fails, then Operations completes it', async () => {
    const a = await ready(clerk, 'corporate', sampleCorporate())
    await request(app).post(`/api/applications/${a.id}/submit`).set(auth(clerk))
    setMockCoreDown(true)
    await request(app).post(`/api/applications/${a.id}/decision`).set(auth(bh)).send({ decision: 'approve', comment: 'ok' })
    const r = await request(app).post(`/api/applications/${a.id}/decision`).set(auth(ops)).send({ decision: 'approve', comment: 'ok' })
    setMockCoreDown(false)
    expect(r.body.status).toBe('FALLBACK_MANUAL')
    const q = (await request(app).get('/api/workspaces/operations/tasks').set(auth(ops))).body.tasks
    const t = q.find((x: any) => x.application_id === a.id && x.type === 'core_fallback'); expect(t).toBeTruthy()
    expect((await request(app).post(`/api/workspaces/tasks/${t.id}/action`).set(auth(ops)).send({ action: 'manual_opened', data: { cif: '000999111' } })).status).toBe(422)
    const done = await request(app).post(`/api/workspaces/tasks/${t.id}/action`).set(auth(ops)).send({ action: 'manual_opened', data: { cif: '000999111', accountNumber: '00100099911101' } })
    expect(done.status).toBe(200)
    const full = (await request(app).get(`/api/applications/${a.id}`).set(auth(ops))).body
    expect(full.status).toBe('ACCOUNT_OPENED'); expect(full.core_status).toBe('manual')
  })
  it('generates the PDF pack with annex', async () => {
    const id = (await pool.query(`SELECT id FROM applications WHERE status='ACCOUNT_OPENED' LIMIT 1`)).rows[0].id
    const r = await request(app).get(`/api/applications/${id}/pdf`).set(auth(clerk)).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))) })
    expect(r.status).toBe(200); expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')
  })
  it('rejects disguised uploads', async () => {
    const a = await newApp(clerk, 'individual', sampleIndividual())
    const r = await request(app).post(`/api/applications/${a.id}/documents`).set(auth(clerk)).field('docType', 'id_copy').attach('file', Buffer.from('MZ fake exe'), { filename: 'x.png', contentType: 'image/png' })
    expect(r.status).toBe(415)
  })
})

describe('application lists', () => {
  it('filters by status, pending-for-me and text within row-level scope', async () => {
    const mine = await request(app).get('/api/applications?status=PENDING_BRANCH_HEAD,DRAFT&q=a').set(auth(clerk)); expect(mine.status).toBe(200)
    const pend = await request(app).get('/api/applications?pendingFor=me').set(auth(bh)); expect(pend.status).toBe(200)
    expect(pend.body.every((r: any) => r.status === 'PENDING_BRANCH_HEAD' && r.branch_code === '001')).toBe(true)
    const other = await request(app).get('/api/applications').set(auth(bhGitega)); expect(other.body.every((r: any) => r.branch_code === '003')).toBe(true)
  })
})

describe('offline sync & devices', () => {
  it('is idempotent on clientUuid', async () => {
    const clientUuid = crypto.randomUUID()
    const op = { opId: crypto.randomUUID(), type: 'create', clientUuid, payload: { kind: 'new_customer', customerType: 'individual', data: sampleIndividual() } }
    const r1 = await request(app).post('/api/sync').set(auth(clerk)).send({ deviceId: 'TAB-T1', ops: [op] })
    const r2 = await request(app).post('/api/sync').set(auth(clerk)).send({ deviceId: 'TAB-T1', ops: [{ ...op, opId: crypto.randomUUID() }] })
    expect(r1.body.results[0].ok).toBe(true); expect(r2.body.results[0].duplicate).toBe(true)
    expect((await pool.query('SELECT count(*)::int n FROM applications WHERE client_uuid=$1', [clientUuid])).rows[0].n).toBe(1)
  })
  it('IT can remotely wipe a tablet', async () => {
    expect((await request(app).post('/api/it/devices/TAB-T1/wipe').set(auth(it_))).status).toBe(200)
    expect((await request(app).post('/api/sync').set(auth(clerk)).send({ deviceId: 'TAB-T1', ops: [] })).body.command).toBe('wipe')
    const l = await request(app).post('/api/auth/login').send({ username: 'clerk1', password: 'Finbank@2026', deviceId: 'TAB-T1' })
    expect(l.status).toBe(423)
  })
})

describe('audit trail', () => {
  it('is append-only and hash-chained', async () => {
    await expect(pool.query(`UPDATE audit_events SET action='x'`)).rejects.toThrow(/append-only/)
    await expect(pool.query(`DELETE FROM audit_events`)).rejects.toThrow(/append-only/)
    expect((await verifyChain()).ok).toBe(true)
    const csv = await request(app).get('/api/audit?format=csv').set(auth(auditor))
    expect(csv.status).toBe(200); expect(csv.text.split('\n')[0]).toContain('hash')
  })
  it('dashboards respond for every role', async () => {
    for (const u of ['clerk1', 'agent1', 'bh1', 'ops1', 'comp1', 'md1', 'audit1', 'admin1', 'it1', 'digital1', 'cards1', 'cs1', 'risk1']) {
      const r = await request(app).get('/api/dashboard').set(auth(await login(u)))
      expect(r.status).toBe(200); expect(r.body.kpis.length).toBeGreaterThan(0)
    }
  })
})
