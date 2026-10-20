import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { z } from 'zod'
import { one, q, pool, tx } from '../db/pool'
import { actorOf, requirePerm } from '../services/auth'
import { audit } from '../services/audit'
import { decide, HttpError, missingDocuments, openInCore, productRule, requiredDocuments, submit, finalizeOpened } from '../services/workflow'
import { readEncrypted, saveEncrypted, sha256 } from '../services/storage'
import { config } from '../config'
import { can } from '../rbac'
import { buildPdfContext } from '../pdf/context'
import { renderPack } from '../pdf/forms'
import { emptyApplicationData, DOC_TYPES, type ApplicationData } from '../../../../packages/shared/domain'
import { validateApplication } from '../../../../packages/shared/validation'

export const applications = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024 } })
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function nameOf(t: string, d: ApplicationData) {
  if (t === 'corporate') return d.entity.legalName || 'Entité sans nom'
  return d.people.filter((p) => p.roles.includes('holder')).map((p) => `${p.firstName} ${p.lastName}`.trim()).filter(Boolean).join(' & ') || 'Sans nom'
}
async function nextRef(branch: string) {
  const r = await one(`SELECT count(*)::int+1 n FROM applications WHERE branch_code=$1 AND created_at >= date_trunc('year', now())`, [branch])
  return `DAO-${branch}-${new Date().getFullYear()}-${String(r.n).padStart(5, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
}

/** Row-level access: own / branch / all, enforced on every read. */
export async function loadForUser(req: any, id: string) {
  const app = await one('SELECT * FROM applications WHERE id=$1', [id])
  if (!app) throw new HttpError(404, 'not_found')
  const u = req.user
  const ok = can(u.role, 'app.read.all') || (can(u.role, 'app.read.branch') && app.branch_code === u.branch) || (can(u.role, 'app.read.own') && app.created_by === u.id)
  if (!ok) throw new HttpError(403, 'forbidden')
  return app
}

const createSchema = z.object({
  clientUuid: z.string().uuid().optional(),
  kind: z.enum(['new_customer', 'additional_account', 'kyc_update']),
  customerType: z.enum(['individual', 'joint', 'corporate']),
  customerId: z.string().uuid().nullish(),
  productCode: z.string().min(1).optional(),
  data: z.any().optional(),
  gps: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional(), at: z.string().optional() }).nullish(),
})
export async function createApplication(req: any, body: z.infer<typeof createSchema>) {
  const u = req.user
  if (body.clientUuid) { const ex = await one('SELECT * FROM applications WHERE client_uuid=$1', [body.clientUuid]); if (ex) return { app: ex, duplicate: true } }
  let data: ApplicationData = { ...emptyApplicationData(), ...(body.data ?? {}) }
  let cif: string | null = null
  if (body.customerId) {
    const c = await one('SELECT * FROM customers WHERE id=$1', [body.customerId]); if (!c) throw new HttpError(404, 'customer_not_found')
    cif = c.cif
    if (!body.data && c.data?.lastKycUpdate) data = { ...c.data.lastKycUpdate, verification: emptyApplicationData().verification, declarations: emptyApplicationData().declarations }
  } else if (body.kind !== 'new_customer') throw new HttpError(422, 'customer_required')
  if (body.productCode) data.account.productCode = body.productCode
  const ref = await nextRef(u.branch ?? 'HQ')
  const r = await one(`INSERT INTO applications(ref,client_uuid,kind,customer_type,customer_id,product_code,branch_code,data,applicant_name,created_by,capture_channel,gps,device_id,cif,referral_source,referral_staff_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [ref, body.clientUuid ?? null, body.kind, body.customerType, body.customerId ?? null, data.account.productCode || null, u.branch ?? 'HQ', data, nameOf(body.customerType, data), u.id, u.role === 'field_agent' ? 'field' : 'branch', body.gps ?? null, req.deviceId ?? null, cif, data.referral?.source || null, data.referral?.staffCode || null])
  await audit(actorOf(req), 'application.created', 'application', r.id, { ref, kind: body.kind, customerType: body.customerType, gps: body.gps ?? null, deviceId: req.deviceId ?? null })
  return { app: r, duplicate: false }
}

applications.post('/', requirePerm('app.create'), async (req, res) => {
  const body = createSchema.parse(req.body)
  const { app, duplicate } = await createApplication(req, body)
  res.status(duplicate ? 200 : 201).json(app)
})

applications.get('/', async (req, res) => {
  const u = req.user!
  const where: string[] = []; const params: unknown[] = []
  if (can(u.role, 'app.read.all')) {} else if (can(u.role, 'app.read.branch')) { params.push(u.branch); where.push(`a.branch_code=$${params.length}`) } else if (can(u.role, 'app.read.own')) { params.push(u.id); where.push(`a.created_by=$${params.length}`) } else return res.status(403).json({ error: 'forbidden' })
  if (req.query.status) { params.push(String(req.query.status).split(',')); where.push(`a.status = ANY($${params.length})`) }
  if (req.query.mine === '1') { params.push(u.id); where.push(`a.created_by=$${params.length}`) }
  if (req.query.pendingFor === 'me') { const st = { branch_head: 'PENDING_BRANCH_HEAD', operations: 'PENDING_OPERATIONS', compliance: 'PENDING_COMPLIANCE', md: 'PENDING_MD' }[u.role as string]; params.push(st ?? 'none'); where.push(`a.status=$${params.length}`) }
  if (req.query.q) { params.push(`%${String(req.query.q).toLowerCase()}%`); where.push(`(lower(a.applicant_name) LIKE $${params.length} OR lower(a.ref) LIKE $${params.length})`) }
  const rows = await q(`SELECT a.id, a.ref, a.kind, a.customer_type, a.product_code, a.branch_code, a.status, a.risk_rating, a.risk_score, a.aml_status, a.applicant_name, a.capture_channel, a.created_at, a.updated_at, a.submitted_at, a.sla_due_at, a.account_number, a.core_status, a.version, u.display_name created_by_name FROM applications a JOIN users u ON u.id=a.created_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.updated_at DESC LIMIT 200`, params)
  res.json(rows)
})

applications.get('/:id', async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  const [docs, approvals, screenings, tasks, required] = await Promise.all([
    q('SELECT id, doc_type, party_id, file_name, mime_type, size_bytes, sha256, qa_status, created_at FROM documents WHERE application_id=$1 ORDER BY created_at', [app.id]),
    q('SELECT a.*, u.display_name actor_name FROM approvals a JOIN users u ON u.id=a.actor_id WHERE application_id=$1 ORDER BY at', [app.id]),
    q('SELECT * FROM aml_screenings WHERE application_id=$1 ORDER BY at', [app.id]),
    q('SELECT id, department, type, title, status, priority, sla_due_at, created_at FROM tasks WHERE application_id=$1 ORDER BY created_at', [app.id]),
    app.product_code ? requiredDocuments(app) : Promise.resolve([]),
  ])
  await audit(actorOf(req), 'application.viewed', 'application', app.id, {})
  res.json({ ...app, documents: docs, approvals, screenings, tasks, requiredDocuments: required })
})

const patchSchema = z.object({ data: z.any(), version: z.number().int(), productCode: z.string().optional() })
export async function patchApplication(req: any, id: string, body: z.infer<typeof patchSchema>) {
  const app = await loadForUser(req, id)
  if (app.created_by !== req.user.id && req.user.role !== 'branch_head') throw new HttpError(403, 'only_maker_can_edit')
  if (!['DRAFT', 'RETURNED'].includes(app.status)) throw new HttpError(409, 'locked')
  if (body.version !== app.version) throw new HttpError(409, 'version_conflict')
  const data: ApplicationData = { ...app.data, ...body.data }
  const pc = body.productCode ?? data.account.productCode ?? app.product_code
  const r = await one('UPDATE applications SET data=$2, product_code=$3, applicant_name=$4, referral_source=$5, referral_staff_code=$6, version=version+1, updated_at=now() WHERE id=$1 RETURNING *', [id, data, pc || null, nameOf(app.customer_type, data), data.referral?.source || null, data.referral?.staffCode || null])
  await audit(actorOf(req), 'application.updated', 'application', id, { version: r.version })
  return r
}
applications.patch('/:id', requirePerm('app.create'), async (req, res) => res.json(await patchApplication(req, req.params.id, patchSchema.parse(req.body))))

applications.get('/:id/validation', async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  const product = app.product_code ? await productRule(app.product_code) : undefined
  const issues = validateApplication(app.customer_type, app.data, product as any)
  const missing = app.product_code ? await missingDocuments(app.id) : []
  res.json({ issues, missingDocuments: missing })
})

applications.post('/:id/documents', requirePerm('app.create'), upload.single('file'), async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  if (!['DRAFT', 'RETURNED'].includes(app.status)) throw new HttpError(409, 'locked')
  const f = req.file; if (!f) throw new HttpError(422, 'file_required')
  if (!ALLOWED_MIME.includes(f.mimetype)) throw new HttpError(415, 'unsupported_type')
  // magic-number sniffing to reject disguised files
  const head = f.buffer.subarray(0, 4).toString('hex')
  if (!['25504446', 'ffd8ffe0', 'ffd8ffe1', 'ffd8ffdb', 'ffd8ffee', '89504e47', '52494646'].some((m) => head.startsWith(m.slice(0, 6)))) throw new HttpError(415, 'content_mismatch')
  const docType = String(req.body.docType)
  if (!(DOC_TYPES as readonly string[]).includes(docType)) throw new HttpError(422, 'invalid_doc_type')
  const hash = sha256(f.buffer)
  const id = crypto.randomUUID()
  const rel = `${app.id}/${id}.bin`
  saveEncrypted(rel, f.buffer)
  const d = await one('INSERT INTO documents(id,application_id,doc_type,party_id,file_name,mime_type,size_bytes,sha256,storage_path,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, doc_type, party_id, file_name, mime_type, size_bytes, sha256, qa_status, created_at',
    [id, app.id, docType, req.body.partyId || null, f.originalname.slice(0, 200), f.mimetype, f.size, hash, rel, req.user!.id])
  await audit(actorOf(req), 'document.uploaded', 'application', app.id, { documentId: id, docType, sha256: hash, size: f.size })
  res.status(201).json(d)
})
applications.get('/:id/documents/:docId', async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  const d = await one('SELECT * FROM documents WHERE id=$1 AND application_id=$2', [req.params.docId, app.id]); if (!d) throw new HttpError(404, 'not_found')
  await audit(actorOf(req), 'document.downloaded', 'application', app.id, { documentId: d.id })
  res.setHeader('content-type', d.mime_type); res.setHeader('content-disposition', `inline; filename="${encodeURIComponent(d.file_name)}"`); res.setHeader('cache-control', 'no-store')
  res.send(readEncrypted(d.storage_path))
})
applications.delete('/:id/documents/:docId', requirePerm('app.create'), async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  if (!['DRAFT', 'RETURNED'].includes(app.status)) throw new HttpError(409, 'locked')
  // soft-delete: retained for audit, excluded from completeness
  await pool.query(`UPDATE documents SET qa_status='rejected' WHERE id=$1 AND application_id=$2`, [req.params.docId, app.id])
  await audit(actorOf(req), 'document.withdrawn', 'application', app.id, { documentId: req.params.docId })
  res.json({ ok: true })
})

applications.post('/:id/submit', requirePerm('app.create'), async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  if (app.created_by !== req.user!.id) throw new HttpError(403, 'only_maker_can_submit')
  res.json(await submit(app.id, actorOf(req)))
})
applications.post('/:id/decision', requirePerm('app.approve'), async (req, res) => {
  const body = z.object({ decision: z.enum(['approve', 'return', 'reject']), comment: z.string().default('') }).parse(req.body)
  await loadForUser(req, req.params.id)
  res.json(await decide(req.params.id, { ...actorOf(req), id: req.user!.id, role: req.user!.role, branch: req.user!.branch }, body.decision, body.comment))
})
applications.post('/:id/retry-core', requirePerm('core.manual_open', 'it.retry'), async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  if (app.status !== 'FALLBACK_MANUAL') throw new HttpError(409, 'invalid_state')
  const status = await openInCore(app.id, actorOf(req))
  if (status === 'ACCOUNT_OPENED') await pool.query(`UPDATE tasks SET status='done', closed_at=now(), updated_at=now() WHERE application_id=$1 AND type='core_fallback' AND status<>'done'`, [app.id])
  res.json({ status })
})
applications.post('/:id/manual-open', requirePerm('core.manual_open'), async (req, res) => {
  const body = z.object({ cif: z.string().min(3), accountNumber: z.string().min(5) }).parse(req.body)
  const app = await loadForUser(req, req.params.id)
  if (app.status !== 'FALLBACK_MANUAL') throw new HttpError(409, 'invalid_state')
  await finalizeOpened(app.id, body.cif, body.accountNumber, 'manual', actorOf(req))
  await pool.query(`UPDATE tasks SET status='done', closed_at=now(), updated_at=now() WHERE application_id=$1 AND type='core_fallback' AND status<>'done'`, [app.id])
  res.json({ status: 'ACCOUNT_OPENED' })
})
applications.get('/:id/pdf', requirePerm('pdf.generate'), async (req, res) => {
  const app = await loadForUser(req, req.params.id)
  const pdf = await renderPack(await buildPdfContext(app))
  await audit(actorOf(req), 'pdf.generated', 'application', app.id, { sha256: sha256(pdf), bytes: pdf.length })
  res.setHeader('content-type', 'application/pdf'); res.setHeader('content-disposition', `inline; filename="${app.ref}.pdf"`); res.setHeader('cache-control', 'no-store')
  res.send(pdf)
})
