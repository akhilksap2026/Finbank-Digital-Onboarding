import type pg from 'pg'
import { pool, q, one, tx } from '../db/pool'
import { audit, type Actor } from './audit'
import { aml } from '../adapters/aml'
import { core } from '../adapters/flexcube'
import { buildChain, scoreRisk, DEFAULT_RISK, type RiskConfig } from './risk'
import { validateApplication, type Issue } from '../../../../packages/shared/validation'
import { PENDING_STATUS_BY_ROLE, type ApplicationData, type CustomerType } from '../../../../packages/shared/domain'
import { SERVICE_TASKS } from '../rbac'

export class HttpError extends Error { constructor(public status: number, public code: string, public issues?: Issue[]) { super(code) } }

export async function setting<T>(key: string, fallback: T): Promise<T> { return ((await one('SELECT value FROM settings WHERE key=$1', [key]))?.value as T) ?? fallback }
async function slaDue(status: string) { const h = (await setting<Record<string, number>>('sla_hours', {}))[status] ?? 24; return new Date(Date.now() + h * 3600_000) }

export async function productRule(code: string) {
  const p = await one('SELECT * FROM products WHERE code=$1 AND active', [code])
  if (!p) return undefined
  return { code: p.code, customerTypes: p.customer_types, currencies: p.currencies, ...p.rules, row: p }
}

/** Required documents for an application: per product/customer type, multiplied by parties when per_party_role is set. */
export async function requiredDocuments(app: { customer_type: string; product_code: string; data: ApplicationData; kind: string }) {
  const reqs = await q('SELECT * FROM document_requirements WHERE customer_type=$1 AND (product_code IS NULL OR product_code=$2) AND mandatory ORDER BY id', [app.customer_type, app.product_code])
  const out: Array<{ docType: string; partyId: string | null; label: any }> = []
  for (const r of reqs) {
    if (app.kind === 'kyc_update' && !['id_copy', 'proof_of_address', 'signed_form_scan'].includes(r.doc_type)) continue
    if (r.per_party_role) {
      for (const p of app.data.people.filter((x) => x.roles.includes(r.per_party_role))) {
        if (r.doc_type === 'residence_certificate' && /burund/i.test(p.nationality)) continue
        out.push({ docType: r.doc_type, partyId: p.id, label: r.labels })
      }
    } else out.push({ docType: r.doc_type, partyId: null, label: r.labels })
  }
  return out
}
export async function missingDocuments(appId: string) {
  const app = await one('SELECT * FROM applications WHERE id=$1', [appId])
  const docs = await q('SELECT doc_type, party_id FROM documents WHERE application_id=$1 AND qa_status <> $2', [appId, 'rejected'])
  return (await requiredDocuments(app)).filter((r) => !docs.some((d) => d.doc_type === r.docType && (r.partyId === null || d.party_id === r.partyId)))
}

export async function submit(appId: string, actor: Actor) {
  const app = await one('SELECT * FROM applications WHERE id=$1', [appId])
  if (!app) throw new HttpError(404, 'not_found')
  if (!['DRAFT', 'RETURNED'].includes(app.status)) throw new HttpError(409, 'invalid_state')
  const data: ApplicationData = app.data
  const product = await productRule(app.product_code)
  const issues = validateApplication(app.customer_type as CustomerType, data, product as any)
  const missing = await missingDocuments(appId)
  for (const m of missing) issues.push({ path: `documents.${m.docType}${m.partyId ? `.${m.partyId}` : ''}`, code: 'missing_document', message: `Missing document: ${m.label?.en ?? m.docType}` })
  if (issues.length) throw new HttpError(422, 'validation_failed', issues)

  // AML screening of every party + the entity
  const parties = data.people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), dateOfBirth: p.dateOfBirth, nationality: p.nationality, idNumber: p.idNumber, declaredPep: p.pep }))
  if (app.customer_type === 'corporate') parties.push({ id: 'entity', name: data.entity.legalName, dateOfBirth: '', nationality: 'Burundi', idNumber: data.entity.registrationNumber, declaredPep: false })
  const adapter = aml()
  let results
  const t0 = Date.now()
  try { results = await adapter.screen(parties) } catch (e: any) {
    await pool.query('INSERT INTO integration_log(system,operation,application_id,status,error,duration_ms) VALUES($1,$2,$3,$4,$5,$6)', ['aml', 'screen', appId, 'error', e.message, Date.now() - t0])
    throw new HttpError(503, 'aml_unavailable')
  }
  await pool.query('INSERT INTO integration_log(system,operation,application_id,status,response,duration_ms) VALUES($1,$2,$3,$4,$5,$6)', ['aml', 'screen', appId, 'success', JSON.stringify(results), Date.now() - t0])
  const riskCfg = await setting<RiskConfig>('risk_config', DEFAULT_RISK)
  const risk = scoreRisk(app.customer_type, data, results, riskCfg)
  const amlStatus = results.some((r) => r.result === 'sanctioned') ? 'sanctioned' : results.some((r) => r.result === 'potential_match') ? 'potential_match' : results.some((r) => r.result === 'pep') ? 'pep' : 'clear'
  const facts = { pep: risk.factors.includes('pep'), riskRating: risk.rating, amlStatus, hasExceptions: (data.exceptions ?? []).length > 0, customerType: app.customer_type, productCode: app.product_code, kind: app.kind, riskScore: risk.score }
  const rules = await q('SELECT * FROM routing_rules WHERE active ORDER BY priority')
  const chain = buildChain(rules, facts)
  const status = PENDING_STATUS_BY_ROLE[chain[0]]
  await tx(async (c) => {
    for (const r of results) {
      const party = parties.find((p) => p.id === r.partyId)
      await c.query('INSERT INTO aml_screenings(application_id,party_id,party_name,result,score,provider,provider_ref,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [appId, r.partyId, party?.name ?? '', r.result, r.score, adapter.name, r.providerRef, r.details])
      if (r.result !== 'clear') await createTask(c, { department: 'compliance', type: 'aml_hit', applicationId: appId, branch: app.branch_code, title: `AML ${r.result}: ${party?.name}`, priority: r.result === 'sanctioned' ? 'critical' : 'high', payload: { partyId: r.partyId, result: r.result, score: r.score, details: r.details } })
    }
    if (risk.rating === 'high' || facts.pep) await createTask(c, { department: 'compliance', type: 'edd', applicationId: appId, branch: app.branch_code, title: `Enhanced due diligence: ${app.applicant_name}`, priority: 'high', payload: { factors: risk.factors } })
    await c.query(`UPDATE applications SET status=$2, approval_chain=$3, chain_index=0, risk_score=$4, risk_rating=$5, risk_factors=$6, aml_status=$7, submitted_at=now(), sla_due_at=$8, updated_at=now(), version=version+1 WHERE id=$1`, [appId, status, chain, risk.score, risk.rating, JSON.stringify(risk.factors), amlStatus, await slaDue(status)])
    await audit(actor, 'application.submitted', 'application', appId, { chain, risk, amlStatus }, c)
  })
  return { status, chain, risk, amlStatus }
}

export async function createTask(c: pg.PoolClient | pg.Pool, t: { department: string; type: string; applicationId?: string | null; branch?: string | null; title: string; priority?: string; payload?: any }) {
  const hours = (await setting<Record<string, number>>('dept_sla_hours', {}))[t.department] ?? 24
  const r = await c.query('INSERT INTO tasks(department,type,application_id,branch_code,title,priority,payload,sla_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [t.department, t.type, t.applicationId ?? null, t.branch ?? null, t.title, t.priority ?? 'normal', t.payload ?? {}, new Date(Date.now() + hours * 3600_000)])
  return r.rows[0].id as string
}

export async function decide(appId: string, actor: Actor & { id: string; role: string; branch?: string | null }, decision: 'approve' | 'return' | 'reject', comment: string) {
  const app = await one('SELECT * FROM applications WHERE id=$1', [appId])
  if (!app) throw new HttpError(404, 'not_found')
  const stepRole = app.approval_chain[app.chain_index]
  if (!stepRole || PENDING_STATUS_BY_ROLE[stepRole] !== app.status) throw new HttpError(409, 'invalid_state')
  if (actor.role !== stepRole) throw new HttpError(403, 'not_your_step')
  if (stepRole === 'branch_head' && actor.branch !== app.branch_code) throw new HttpError(403, 'other_branch')
  if (app.created_by === actor.id) throw new HttpError(403, 'maker_checker_violation')
  if ((decision !== 'approve' || app.risk_rating === 'high') && !comment.trim()) throw new HttpError(422, 'comment_required')
  if (decision === 'approve' && stepRole === 'compliance') {
    const open = await one(`SELECT count(*)::int n FROM tasks WHERE application_id=$1 AND department='compliance' AND type IN ('aml_hit','edd') AND status NOT IN ('done','rejected')`, [appId])
    if (open.n > 0) throw new HttpError(409, 'open_compliance_cases')
    if (app.aml_status === 'sanctioned') throw new HttpError(409, 'sanctioned_party')
  }
  let next = app.status, idx = app.chain_index
  if (decision === 'return') next = 'RETURNED'
  else if (decision === 'reject') next = 'REJECTED'
  else { idx += 1; next = idx < app.approval_chain.length ? PENDING_STATUS_BY_ROLE[app.approval_chain[idx]] : 'APPROVED' }
  await tx(async (c) => {
    await c.query('INSERT INTO approvals(application_id,step_role,decision,comment,actor_id) VALUES($1,$2,$3,$4,$5)', [appId, stepRole, decision, comment, actor.id])
    await c.query('UPDATE applications SET status=$2, chain_index=$3, sla_due_at=$4, decided_at=CASE WHEN $2 IN (\'APPROVED\',\'REJECTED\') THEN now() ELSE decided_at END, updated_at=now(), version=version+1 WHERE id=$1', [appId, next, idx, ['APPROVED', 'REJECTED', 'RETURNED'].includes(next) ? null : await slaDue(next)])
    await audit(actor, `application.${decision}`, 'application', appId, { stepRole, comment, next }, c)
  })
  if (next === 'APPROVED') return { status: await openInCore(appId, actor) }
  return { status: next }
}

/** Create CIF + account in Flexcube (idempotent via MSGID), else fall back to manual opening by Operations. */
export async function openInCore(appId: string, actor: Actor): Promise<string> {
  const app = await one('SELECT a.*, p.flexcube_account_class FROM applications a JOIN products p ON p.code=a.product_code WHERE a.id=$1', [appId])
  const data: ApplicationData = app.data
  const adapter = core()
  const holder = data.people.find((p) => p.roles.includes('holder')) ?? data.people[0]
  const corp = app.customer_type === 'corporate'
  const call = async <T>(operation: string, key: string, fn: () => Promise<T>): Promise<T> => {
    const prior = await one(`SELECT response FROM integration_log WHERE system='flexcube' AND operation=$1 AND idempotency_key=$2 AND status='success'`, [operation, key])
    if (prior) return prior.response as T
    const t0 = Date.now()
    try {
      const r = await fn()
      await pool.query('INSERT INTO integration_log(system,operation,idempotency_key,application_id,status,response,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)', ['flexcube', operation, key, appId, 'success', JSON.stringify(r), Date.now() - t0])
      return r
    } catch (e: any) {
      await pool.query('INSERT INTO integration_log(system,operation,idempotency_key,application_id,status,error,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)', ['flexcube', operation, key, appId, 'error', e.message, Date.now() - t0])
      throw e
    }
  }
  try {
    if (app.kind === 'kyc_update') {
      await tx(async (c) => {
        await c.query(`UPDATE customers SET data=data || $2::jsonb, kyc_last_review=now()::date, kyc_next_review=(now() + ($3 || ' months')::interval)::date, risk_rating=$4 WHERE id=$1`, [app.customer_id, JSON.stringify({ lastKycUpdate: data }), app.risk_rating === 'high' ? '12' : app.risk_rating === 'medium' ? '24' : '36', app.risk_rating])
        await c.query(`UPDATE applications SET status='ACCOUNT_OPENED', core_status='created', updated_at=now() WHERE id=$1`, [appId])
        await audit(actor, 'customer.kyc_updated', 'customer', app.customer_id, { applicationId: appId }, c)
      })
      await createTask(pool, { department: 'operations', type: 'document_qa', applicationId: appId, branch: app.branch_code, title: `KYC update: update Flexcube CIF ${app.cif ?? ''} (ModifyCustomer)`, payload: {} })
      return 'ACCOUNT_OPENED'
    }
    let cif = app.cif as string | null
    if (!cif) {
      const r = await call('CreateCustomer', `${app.id}:cust`, () => adapter.createCustomer({ msgId: `${app.ref}-C`, branch: app.branch_code, customerType: corp ? 'C' : 'I', shortName: (corp ? data.entity.legalName : `${holder.lastName}`).slice(0, 20).toUpperCase(), fullName: app.applicant_name, firstName: holder?.firstName, lastName: holder?.lastName, dateOfBirth: holder?.dateOfBirth, nationality: 'BI', idNumber: corp ? data.entity.registrationNumber : holder?.idNumber, nif: corp ? data.entity.nif : holder?.nif, address1: corp ? data.entity.physicalAddress : [holder.address.avenue, holder.address.quarter].filter(Boolean).join(', '), address2: corp ? data.entity.town : [holder.address.commune, holder.address.province].filter(Boolean).join(', '), phone: corp ? data.entity.mobile : holder?.phone, email: corp ? data.entity.email : holder?.email, category: corp ? 'CORPORATE' : 'INDIVIDUAL' }))
      cif = r.cif
      await pool.query('UPDATE applications SET cif=$2 WHERE id=$1', [appId, cif])
    }
    const acc = await call('CreateCustAcc', `${app.id}:acc`, () => adapter.createAccount({ msgId: `${app.ref}-A`, branch: app.branch_code, cif: cif!, accountClass: app.flexcube_account_class, currency: data.account.currency, accountName: data.account.accountName }))
    await finalizeOpened(appId, cif!, acc.accountNumber, 'created', actor)
    return 'ACCOUNT_OPENED'
  } catch (e: any) {
    await tx(async (c) => {
      await c.query(`UPDATE applications SET status='FALLBACK_MANUAL', core_status='failed', updated_at=now() WHERE id=$1`, [appId])
      const exists = (await c.query(`SELECT 1 FROM tasks WHERE application_id=$1 AND type='core_fallback' AND status NOT IN ('done')`, [appId])).rowCount
      if (!exists) await createTask(c, { department: 'operations', type: 'core_fallback', applicationId: appId, branch: app.branch_code, title: `Manual opening required: ${app.applicant_name}`, priority: 'high', payload: { error: e.message } })
      await createTask(c, { department: 'it', type: 'integration_error', applicationId: appId, branch: app.branch_code, title: `Flexcube error on ${app.ref}`, payload: { error: e.message } })
      await c.query('INSERT INTO error_log(source,message,detail) VALUES($1,$2,$3)', ['flexcube', e.message, { appId }])
      await audit(actor, 'core.fallback_manual', 'application', appId, { error: e.message }, c)
    })
    return 'FALLBACK_MANUAL'
  }
}

export async function finalizeOpened(appId: string, cif: string, accountNumber: string, coreStatus: 'created' | 'manual', actor: Actor) {
  const app = await one('SELECT * FROM applications WHERE id=$1', [appId])
  const data: ApplicationData = app.data
  await tx(async (c) => {
    let customerId = app.customer_id
    const holder = data.people.find((p) => p.roles.includes('holder')) ?? data.people[0]
    if (!customerId) {
      const r = await c.query(`INSERT INTO customers(cif,customer_type,full_name,id_number,nif,date_of_birth,phone,branch_code,risk_rating,kyc_last_review,kyc_next_review,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()::date,(now() + ($10 || ' months')::interval)::date,$11) ON CONFLICT (cif) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
        [cif, app.customer_type, app.applicant_name, app.customer_type === 'corporate' ? data.entity.registrationNumber : holder?.idNumber, app.customer_type === 'corporate' ? data.entity.nif : holder?.nif, app.customer_type === 'corporate' ? null : holder?.dateOfBirth || null, app.customer_type === 'corporate' ? data.entity.mobile : holder?.phone, app.branch_code, app.risk_rating, app.risk_rating === 'high' ? '12' : app.risk_rating === 'medium' ? '24' : '36', { source: app.ref }])
      customerId = r.rows[0].id
    }
    await c.query(`UPDATE applications SET status='ACCOUNT_OPENED', cif=$2, account_number=$3, core_status=$4, customer_id=$5, updated_at=now() WHERE id=$1`, [appId, cif, accountNumber, coreStatus, customerId])
    for (const [k, def] of Object.entries(SERVICE_TASKS)) if ((data.services as any)[k]) await createTask(c, { department: def.department, type: def.type, applicationId: appId, branch: app.branch_code, title: `${def.title}: ${app.applicant_name} (${accountNumber})`, payload: { accountNumber, cif, ...(k === 'chequeBook' ? { leaves: data.services.chequeLeaves, books: data.services.chequeBooks } : {}), ...(k === 'finconnect' ? { operators: data.operators.length } : {}) } })
    await createTask(c, { department: 'operations', type: 'document_qa', applicationId: appId, branch: app.branch_code, title: `Document QA: ${app.applicant_name}`, payload: {} })
    await audit(actor, coreStatus === 'manual' ? 'core.manual_opened' : 'core.account_created', 'application', appId, { cif, accountNumber }, c)
  })
}
