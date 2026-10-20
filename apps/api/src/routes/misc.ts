import { Router } from 'express'
import { z } from 'zod'
import { one, q, pool } from '../db/pool'
import { actorOf, authenticate, requirePerm, sign, MOCK_PASSWORD } from '../services/auth'
import { audit, verifyChain } from '../services/audit'
import { HttpError, createTask, setting } from '../services/workflow'
import { DEPARTMENTS, ROLE_PERMISSIONS, deptFor, can } from '../rbac'
import { config } from '../config'
import { aml } from '../adapters/aml'
import { core } from '../adapters/flexcube'
import { DEFAULT_RISK } from '../services/risk'
import { createApplication, patchApplication } from './applications'

// ---------------- auth ----------------
export const auth = Router()
auth.post('/login', async (req, res) => {
  const b = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256), deviceId: z.string().max(80).optional(), deviceLabel: z.string().max(80).optional() }).parse(req.body)
  const u = await authenticate(b.username, b.password)
  if (!u) { await audit({ id: null, name: b.username, role: 'none', ip: req.ip }, 'auth.login_failed', 'user', null, { username: b.username }); throw new HttpError(401, 'invalid_credentials') }
  if (b.deviceId) {
    const dev = await one('SELECT * FROM devices WHERE device_id=$1', [b.deviceId])
    if (dev && ['locked', 'wipe_pending', 'wiped'].includes(dev.status)) { await audit({ ...u, name: u.displayName, ip: req.ip }, 'auth.login_blocked_device', 'device', b.deviceId, { status: dev.status }); throw new HttpError(423, `device_${dev.status}`) }
    await pool.query(`INSERT INTO devices(device_id,label,user_id,branch_code,last_seen_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT (device_id) DO UPDATE SET user_id=$3, branch_code=$4, last_seen_at=now()`, [b.deviceId, b.deviceLabel ?? 'Browser', u.id, u.branch])
  }
  await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id])
  await audit({ id: u.id, name: u.displayName, role: u.role, branch: u.branch, ip: req.ip }, 'auth.login', 'user', u.id, { deviceId: b.deviceId, mode: config.authMode })
  res.json({ token: sign(u), user: u, permissions: ROLE_PERMISSIONS[u.role], departments: deptFor(u.role).map((d) => d.key), authMode: config.authMode })
})
auth.get('/mode', (_req, res) => res.json({ mode: config.authMode, mockPasswordHint: config.authMode === 'mock' ? MOCK_PASSWORD : undefined }))

// ---------------- catalog ----------------
export const catalog = Router()
catalog.get('/products', async (_req, res) => res.json(await q('SELECT * FROM products WHERE active ORDER BY code')))
catalog.get('/branches', async (_req, res) => res.json(await q('SELECT * FROM branches ORDER BY name')))
catalog.get('/documents', async (_req, res) => res.json(await q('SELECT * FROM document_requirements ORDER BY customer_type, id')))

// ---------------- customers (duplicate search, status lookup) ----------------
export const customers = Router()
customers.get('/search', requirePerm('customer.search', 'customer.lookup_status'), async (req, res) => {
  const s = z.object({ q: z.string().max(100).default(''), idNumber: z.string().max(40).default(''), nif: z.string().max(20).default(''), phone: z.string().max(20).default('') }).parse(req.query)
  if (!s.q && !s.idNumber && !s.nif && !s.phone) return res.json({ customers: [], applications: [] })
  const cs = await q(`SELECT id, cif, customer_type, full_name, id_number, nif, date_of_birth, phone, branch_code, risk_rating, kyc_next_review FROM customers WHERE ($1<>'' AND lower(full_name) LIKE '%'||lower($1)||'%') OR ($2<>'' AND id_number=$2) OR ($3<>'' AND nif=$3) OR ($4<>'' AND replace(phone,' ','')=replace($4,' ','')) LIMIT 20`, [s.q, s.idNumber, s.nif, s.phone])
  const apps = await q(`SELECT id, ref, applicant_name, status, branch_code, created_at FROM applications WHERE status NOT IN ('REJECTED') AND (($1<>'' AND lower(applicant_name) LIKE '%'||lower($1)||'%') OR ($2<>'' AND data::text LIKE '%"idNumber": "'||$2||'"%')) ORDER BY created_at DESC LIMIT 20`, [s.q, s.idNumber])
  await audit(actorOf(req), 'customer.searched', 'customer', null, { q: s.q ? '[name]' : '', byId: !!s.idNumber, byNif: !!s.nif })
  res.json({ customers: cs, applications: apps, coreSource: core().name })
})
customers.get('/status/:ref', requirePerm('customer.lookup_status'), async (req, res) => {
  const a = await one(`SELECT ref, applicant_name, status, branch_code, submitted_at, updated_at, account_number, product_code, referral_source FROM applications WHERE ref=$1`, [req.params.ref])
  if (!a) throw new HttpError(404, 'not_found')
  const services = await q(`SELECT title, department, status, updated_at FROM tasks WHERE application_id=(SELECT id FROM applications WHERE ref=$1) AND type LIKE 'svc_%'`, [req.params.ref])
  res.json({ ...a, services })
})

// ---------------- offline sync ----------------
export const sync = Router()
const opSchema = z.object({ opId: z.string().uuid(), type: z.enum(['create', 'update']), clientUuid: z.string().uuid(), payload: z.any() })
sync.post('/', async (req, res) => {
  const b = z.object({ deviceId: z.string().max(80), ops: z.array(opSchema).max(100), pendingItems: z.number().int().optional(), gps: z.any().optional() }).parse(req.body)
  const dev = await one('SELECT * FROM devices WHERE device_id=$1', [b.deviceId])
  if (dev && ['locked', 'wipe_pending'].includes(dev.status)) {
    if (dev.status === 'wipe_pending') await pool.query(`UPDATE devices SET status='wiped' WHERE device_id=$1`, [b.deviceId])
    await audit(actorOf(req), `device.${dev.status === 'wipe_pending' ? 'wiped' : 'locked_ack'}`, 'device', b.deviceId, {})
    return res.json({ command: dev.status === 'wipe_pending' ? 'wipe' : 'lock', results: [] })
  }
  const results = []
  for (const op of b.ops) {
    try {
      if (op.type === 'create') { const { app, duplicate } = await createApplication(req, { ...op.payload, clientUuid: op.clientUuid }); results.push({ opId: op.opId, ok: true, id: app.id, ref: app.ref, version: app.version, duplicate }) }
      else {
        const app = await one('SELECT id, version FROM applications WHERE client_uuid=$1', [op.clientUuid]); if (!app) throw new HttpError(404, 'not_found')
        const r = await patchApplication(req, app.id, { data: op.payload.data, version: op.payload.version ?? app.version, productCode: op.payload.productCode })
        results.push({ opId: op.opId, ok: true, id: r.id, ref: r.ref, version: r.version })
      }
    } catch (e: any) { results.push({ opId: op.opId, ok: false, error: e.code ?? e.message }) }
  }
  await pool.query(`INSERT INTO devices(device_id,label,user_id,branch_code,last_seen_at,last_sync_at,pending_items,last_gps) VALUES($1,'Tablet',$2,$3,now(),now(),$4,$5) ON CONFLICT (device_id) DO UPDATE SET last_seen_at=now(), last_sync_at=now(), pending_items=$4, last_gps=COALESCE($5, devices.last_gps), user_id=$2`, [b.deviceId, req.user!.id, req.user!.branch, b.pendingItems ?? 0, b.gps ?? null])
  if (b.ops.length) await audit(actorOf(req), 'device.synced', 'device', b.deviceId, { ops: b.ops.length, failed: results.filter((r) => !r.ok).length })
  res.json({ command: null, results })
})

// ---------------- department workspaces / tasks ----------------
export const workspaces = Router()
workspaces.get('/', (req, res) => res.json(DEPARTMENTS.filter((d) => d.roles.includes(req.user!.role)).map(({ key, name, actions, slaHours, taskTypes }) => ({ key, name, actions, slaHours, taskTypes }))))
workspaces.get('/:dept/tasks', requirePerm('dept.work'), async (req, res) => {
  const d = DEPARTMENTS.find((x) => x.key === req.params.dept)
  if (!d || !d.roles.includes(req.user!.role)) throw new HttpError(403, 'not_your_department')
  const status = String(req.query.status || 'open,in_progress,ready,escalated,finding,returned,str_flagged').split(',')
  const rows = await q(`SELECT t.*, a.ref, a.applicant_name, a.status app_status, a.account_number, u.display_name assignee FROM tasks t LEFT JOIN applications a ON a.id=t.application_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.department=$1 AND t.status = ANY($2) ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, t.sla_due_at NULLS LAST LIMIT 300`, [d.key, status])
  const kpi = await one(`SELECT count(*) FILTER (WHERE status NOT IN ('done','rejected'))::int open, count(*) FILTER (WHERE status NOT IN ('done','rejected') AND sla_due_at < now())::int breached, count(*) FILTER (WHERE status='done' AND closed_at > now()-interval '1 day')::int done_today, coalesce(round(avg(extract(epoch from closed_at-created_at)/3600) FILTER (WHERE status='done')::numeric,1),0)::float avg_hours FROM tasks WHERE department=$1`, [d.key])
  res.json({ department: { key: d.key, name: d.name, actions: d.actions, slaHours: d.slaHours }, tasks: rows, kpi })
})
workspaces.post('/tasks/:id/action', requirePerm('dept.work'), async (req, res) => {
  const b = z.object({ action: z.string(), note: z.string().max(2000).default(''), data: z.record(z.string()).default({}) }).parse(req.body)
  const t = await one('SELECT * FROM tasks WHERE id=$1', [req.params.id]); if (!t) throw new HttpError(404, 'not_found')
  const d = DEPARTMENTS.find((x) => x.key === t.department)!
  if (!d.roles.includes(req.user!.role)) throw new HttpError(403, 'not_your_department')
  const a = d.actions.find((x) => x.key === b.action); if (!a) throw new HttpError(422, 'unknown_action')
  for (const r of a.requires ?? []) if (r === 'note' ? !b.note.trim() : !b.data[r]) throw new HttpError(422, `${r}_required`)
  if (b.action === 'manual_opened') {
    const { finalizeOpened } = await import('../services/workflow')
    await finalizeOpened(t.application_id, b.data.cif, b.data.accountNumber, 'manual', actorOf(req))
  }
  if (b.action === 'retry_core') {
    const { openInCore } = await import('../services/workflow')
    const st = await openInCore(t.application_id, actorOf(req)); if (st === 'ACCOUNT_OPENED') { a.to = 'done' }
  }
  if (b.action === 'confirm_match') await pool.query(`UPDATE applications SET aml_status='sanctioned' WHERE id=$1`, [t.application_id])
  if (b.action === 'flag_str') await createTask(pool, { department: 'compliance', type: 'str', applicationId: t.application_id, branch: t.branch_code, title: `STR prepared for CRF: ${t.title}`, priority: 'critical', payload: { sourceTask: t.id, note: b.note } })
  if (b.action === 'raise_finding') await createTask(pool, { department: 'audit', type: 'audit_finding', applicationId: t.application_id, branch: t.branch_code, title: `Finding: ${b.note.slice(0, 80)}`, priority: 'high', payload: { sourceTask: t.id } })
  const history = [...t.history, { at: new Date().toISOString(), by: req.user!.displayName, action: b.action, note: b.note }]
  const r = await one(`UPDATE tasks SET status=$2, history=$3, assigned_to=COALESCE(assigned_to,$4), updated_at=now(), closed_at=CASE WHEN $2 IN ('done','rejected') THEN now() ELSE NULL END WHERE id=$1 RETURNING *`, [t.id, a.to, JSON.stringify(history), req.user!.id])
  await audit(actorOf(req), `task.${b.action}`, 'task', t.id, { department: t.department, type: t.type, applicationId: t.application_id, note: b.note })
  res.json(r)
})
// Internal audit: random sampling of opened files
workspaces.post('/audit/sample', requirePerm('audit.findings'), async (req, res) => {
  const n = z.object({ size: z.number().int().min(1).max(50).default(5), branch: z.string().optional() }).parse(req.body).size
  const apps = await q(`SELECT id, ref, applicant_name, branch_code FROM applications WHERE status IN ('ACCOUNT_OPENED','FALLBACK_MANUAL','REJECTED') ORDER BY random() LIMIT $1`, [n])
  for (const a of apps) await createTask(pool, { department: 'audit', type: 'audit_sample', applicationId: a.id, branch: a.branch_code, title: `Sample review: ${a.applicant_name} (${a.ref})` })
  await audit(actorOf(req), 'audit.sample_drawn', 'audit', null, { size: apps.length, refs: apps.map((a) => a.ref) })
  res.json({ sampled: apps.length })
})

// ---------------- audit trail ----------------
export const auditRoutes = Router()
auditRoutes.get('/', requirePerm('audit.read'), async (req, res) => {
  const s = z.object({ q: z.string().default(''), entityId: z.string().default(''), action: z.string().default(''), from: z.string().default(''), to: z.string().default(''), limit: z.coerce.number().default(200), format: z.string().default('json') }).parse(req.query)
  const rows = await q(`SELECT * FROM audit_events WHERE ($1='' OR actor_name ILIKE '%'||$1||'%' OR detail::text ILIKE '%'||$1||'%') AND ($2='' OR entity_id=$2) AND ($3='' OR action LIKE $3||'%') AND ($4='' OR at >= $4::timestamptz) AND ($5='' OR at <= $5::timestamptz) ORDER BY id DESC LIMIT $6`, [s.q, s.entityId, s.action, s.from, s.to, Math.min(s.limit, 5000)])
  if (s.format === 'csv') {
    if (!can(req.user!.role, 'audit.export')) throw new HttpError(403, 'forbidden')
    await audit(actorOf(req), 'audit.exported', 'audit', null, { rows: rows.length, filters: s })
    const esc = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
    res.setHeader('content-type', 'text/csv'); res.setHeader('content-disposition', 'attachment; filename="audit-trail.csv"')
    return res.send(['id,at,actor,role,action,entity,entity_id,branch,ip,detail,hash', ...rows.map((r) => [r.id, new Date(r.at).toISOString(), r.actor_name, r.actor_role, r.action, r.entity, r.entity_id, r.branch_code, r.ip, JSON.stringify(r.detail), r.hash].map(esc).join(','))].join('\n'))
  }
  res.json(rows)
})
auditRoutes.get('/verify', requirePerm('audit.read'), async (_req, res) => res.json(await verifyChain()))

// ---------------- admin ----------------
export const admin = Router()
admin.get('/users', requirePerm('admin.users'), async (_req, res) => res.json(await q('SELECT id, username, display_name, role, branch_code, staff_code, email, active, last_login_at FROM users ORDER BY role, username')))
admin.post('/users', requirePerm('admin.users'), async (req, res) => {
  const b = z.object({ username: z.string().min(2), displayName: z.string().min(2), role: z.enum(Object.keys(ROLE_PERMISSIONS) as [string, ...string[]]), branchCode: z.string().nullable(), staffCode: z.string().nullable(), email: z.string().nullable().optional(), active: z.boolean().default(true) }).parse(req.body)
  const r = await one(`INSERT INTO users(username,display_name,role,branch_code,staff_code,email,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (username) DO UPDATE SET display_name=$2, role=$3, branch_code=$4, staff_code=$5, email=$6, active=$7 RETURNING *`, [b.username, b.displayName, b.role, b.branchCode, b.staffCode, b.email ?? null, b.active])
  await audit(actorOf(req), 'admin.user_saved', 'user', r.id, { role: b.role, active: b.active })
  res.json(r)
})
admin.put('/products/:code', requirePerm('admin.catalog'), async (req, res) => {
  const b = z.object({ names: z.record(z.string()), category: z.string(), customer_types: z.array(z.string()), currencies: z.array(z.string()), min_opening: z.record(z.number()), monthly_fee: z.record(z.number()).default({}), rules: z.record(z.any()).default({}), flexcube_account_class: z.string(), form_type_label: z.string(), active: z.boolean() }).parse(req.body)
  const r = await one(`INSERT INTO products(code,names,category,customer_types,currencies,min_opening,monthly_fee,rules,flexcube_account_class,form_type_label,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code) DO UPDATE SET names=$2,category=$3,customer_types=$4,currencies=$5,min_opening=$6,monthly_fee=$7,rules=$8,flexcube_account_class=$9,form_type_label=$10,active=$11,updated_at=now() RETURNING *`, [req.params.code, b.names, b.category, b.customer_types, b.currencies, b.min_opening, b.monthly_fee, b.rules, b.flexcube_account_class, b.form_type_label, b.active])
  await audit(actorOf(req), 'admin.product_saved', 'product', req.params.code, b)
  res.json(r)
})
admin.post('/documents', requirePerm('admin.catalog'), async (req, res) => {
  const b = z.object({ id: z.number().optional(), customer_type: z.string(), product_code: z.string().nullable(), doc_type: z.string(), per_party_role: z.string().nullable(), mandatory: z.boolean(), labels: z.record(z.string()) }).parse(req.body)
  const r = b.id ? await one('UPDATE document_requirements SET customer_type=$2, product_code=$3, doc_type=$4, per_party_role=$5, mandatory=$6, labels=$7 WHERE id=$1 RETURNING *', [b.id, b.customer_type, b.product_code, b.doc_type, b.per_party_role, b.mandatory, b.labels]) : await one('INSERT INTO document_requirements(customer_type,product_code,doc_type,per_party_role,mandatory,labels) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.customer_type, b.product_code, b.doc_type, b.per_party_role, b.mandatory, b.labels])
  await audit(actorOf(req), 'admin.document_requirement_saved', 'document_requirement', String(r.id), b)
  res.json(r)
})
admin.get('/rules', requirePerm('admin.rules', 'risk.config'), async (_req, res) => res.json(await q('SELECT * FROM routing_rules ORDER BY priority')))
admin.post('/rules', requirePerm('admin.rules'), async (req, res) => {
  const b = z.object({ id: z.number().optional(), name: z.string(), priority: z.number().int(), condition: z.object({ any: z.array(z.any()).optional(), all: z.array(z.any()).optional() }), add_role: z.enum(['operations', 'compliance', 'md']), active: z.boolean() }).parse(req.body)
  const r = b.id ? await one('UPDATE routing_rules SET name=$2, priority=$3, condition=$4, add_role=$5, active=$6 WHERE id=$1 RETURNING *', [b.id, b.name, b.priority, b.condition, b.add_role, b.active]) : await one('INSERT INTO routing_rules(name,priority,condition,add_role,active) VALUES($1,$2,$3,$4,$5) RETURNING *', [b.name, b.priority, b.condition, b.add_role, b.active])
  await audit(actorOf(req), 'admin.rule_saved', 'routing_rule', String(r.id), b)
  res.json(r)
})
admin.get('/risk-config', requirePerm('risk.config', 'admin.rules'), async (_req, res) => res.json(await setting('risk_config', DEFAULT_RISK)))
admin.put('/risk-config', requirePerm('risk.config'), async (req, res) => {
  const b = z.object({ weights: z.record(z.number()), thresholds: z.object({ medium: z.number(), high: z.number() }), highRiskCountries: z.array(z.string()), highInflowBIF: z.number(), highRiskActivities: z.array(z.string()) }).parse(req.body)
  await pool.query(`INSERT INTO settings(key,value) VALUES('risk_config',$1) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()`, [b])
  await audit(actorOf(req), 'risk.config_updated', 'settings', 'risk_config', b)
  res.json(b)
})
admin.get('/integrations', requirePerm('admin.integrations'), async (_req, res) => {
  const t0 = Date.now()
  const [fc, am] = await Promise.all([core().health(), aml().health()])
  const stats = await q(`SELECT system, count(*)::int total, count(*) FILTER (WHERE status='error')::int errors, max(at) FILTER (WHERE status='success') last_success, max(at) FILTER (WHERE status='error') last_error, round(avg(duration_ms))::int avg_ms FROM integration_log WHERE at > now()-interval '7 days' GROUP BY system`)
  res.json({ checkedInMs: Date.now() - t0, systems: [
    { key: 'flexcube', name: 'Oracle FLEXCUBE 14.0 (Gateway SOAP)', mode: config.flexcube.mode, adapter: core().name, healthy: fc, ...stats.find((s) => s.system === 'flexcube') },
    { key: 'aml', name: 'AML / Sanctions screening', mode: config.aml.mode, adapter: aml().name, healthy: am, ...stats.find((s) => s.system === 'aml') },
    { key: 'ldap', name: 'Active Directory (LDAP)', mode: config.authMode, adapter: config.authMode === 'ldap' ? config.ldap.url : 'mock', healthy: true },
    { key: 'sms', name: 'SMS / OTP gateway', mode: 'placeholder', adapter: 'not-configured', healthy: false, note: 'OTP is a placeholder (staff attestation) until the SMS provider is selected' },
    { key: 'database', name: 'PostgreSQL', mode: 'primary', adapter: 'pg', healthy: !!(await one('SELECT 1 ok')) },
  ] })
})

// ---------------- IT ----------------
export const it = Router()
it.get('/devices', requirePerm('it.devices'), async (_req, res) => res.json(await q('SELECT d.*, u.display_name user_name FROM devices d LEFT JOIN users u ON u.id=d.user_id ORDER BY last_seen_at DESC NULLS LAST')))
it.post('/devices/:id/:cmd', requirePerm('it.devices'), async (req, res) => {
  const map: Record<string, string> = { lock: 'locked', wipe: 'wipe_pending', unlock: 'active' }
  const st = map[req.params.cmd]; if (!st) throw new HttpError(422, 'unknown_command')
  const r = await one('UPDATE devices SET status=$2 WHERE device_id=$1 RETURNING *', [req.params.id, st]); if (!r) throw new HttpError(404, 'not_found')
  await audit(actorOf(req), `device.${req.params.cmd}`, 'device', req.params.id, {})
  res.json(r)
})
it.get('/device-status/:id', async (req, res) => res.json({ status: (await one('SELECT status FROM devices WHERE device_id=$1', [req.params.id]))?.status ?? 'unknown' }))
it.get('/logs', requirePerm('it.logs'), async (_req, res) => res.json({ errors: await q('SELECT * FROM error_log ORDER BY id DESC LIMIT 100'), integrations: await q('SELECT l.id, l.system, l.operation, l.status, l.error, l.attempts, l.duration_ms, l.at, a.ref FROM integration_log l LEFT JOIN applications a ON a.id=l.application_id ORDER BY l.id DESC LIMIT 100') }))
it.get('/config', requirePerm('it.logs'), (_req, res) => res.json({ authMode: config.authMode, ldapUrl: config.ldap.url, ldapBaseDn: config.ldap.baseDn, flexcubeMode: config.flexcube.mode, flexcubeUrl: config.flexcube.url, amlMode: config.aml.mode, retentionYears: config.retentionYears, maxUploadMb: config.maxUploadMb }))
it.post('/jobs/:job', requirePerm('it.retry'), async (req, res) => {
  if (req.params.job === 'retry-core') {
    const { openInCore } = await import('../services/workflow')
    const apps = await q(`SELECT id FROM applications WHERE status='FALLBACK_MANUAL' LIMIT 50`)
    const out = []
    for (const a of apps) { const st = await openInCore(a.id, actorOf(req)); out.push(st); if (st === 'ACCOUNT_OPENED') await pool.query(`UPDATE tasks SET status='done', closed_at=now() WHERE application_id=$1 AND type='core_fallback' AND status<>'done'`, [a.id]) }
    await audit(actorOf(req), 'job.retry_core', 'job', null, { attempted: apps.length, opened: out.filter((s) => s === 'ACCOUNT_OPENED').length })
    return res.json({ attempted: apps.length, opened: out.filter((s) => s === 'ACCOUNT_OPENED').length })
  }
  if (req.params.job === 'kyc-refresh') res.json(await kycRefreshJob(actorOf(req)))
  else throw new HttpError(404, 'unknown_job')
})
export async function kycRefreshJob(actor: any) {
  const due = await q(`SELECT c.* FROM customers c WHERE kyc_next_review <= now() + interval '30 days' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.type='kyc_refresh' AND t.payload->>'customerId'=c.id::text AND t.status<>'done')`)
  for (const c of due) await createTask(pool, { department: 'compliance', type: 'kyc_refresh', branch: c.branch_code, title: `KYC refresh due ${c.kyc_next_review}: ${c.full_name} (CIF ${c.cif})`, priority: c.risk_rating === 'high' ? 'high' : 'normal', payload: { customerId: c.id, cif: c.cif } })
  await audit(actor, 'job.kyc_refresh', 'job', null, { created: due.length })
  return { created: due.length }
}
