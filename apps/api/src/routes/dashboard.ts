import { Router } from 'express'
import { one, q } from '../db/pool'
import type { Role } from '../../../../packages/shared/domain'

type Kpi = { key: string; label: string; value: number | string; tone?: 'navy' | 'orange' | 'red' | 'green' }
type Table = { key: string; title: string; columns: string[]; rows: Array<Array<string | number | null>>; link?: string }
type Bars = { key: string; title: string; items: Array<{ label: string; value: number }> }
export interface Dashboard { role: Role; kpis: Kpi[]; tables: Table[]; bars: Bars[] }

const n = async (sql: string, p: unknown[] = []) => Number((await one(sql, p))?.n ?? 0)
const fmt = (d: any) => (d ? new Date(d).toLocaleString('sv-SE', { timeZone: process.env.DISPLAY_TZ || 'Africa/Bujumbura' }).slice(0, 16) : '')
const PENDING = `('PENDING_BRANCH_HEAD','PENDING_OPERATIONS','PENDING_COMPLIANCE','PENDING_MD')`

async function deptTable(dept: string, title: string, key: string, types?: string[]): Promise<Table> {
  const rows = await q(`SELECT t.title, t.type, t.status, t.priority, t.sla_due_at, a.ref FROM tasks t LEFT JOIN applications a ON a.id=t.application_id WHERE t.department=$1 AND t.status NOT IN ('done','rejected') ${types ? 'AND t.type = ANY($2)' : ''} ORDER BY t.sla_due_at LIMIT 10`, types ? [dept, types] : [dept])
  return { key, title, columns: ['Task', 'Type', 'Status', 'Priority', 'SLA due', 'Ref'], rows: rows.map((r) => [r.title, r.type, r.status, r.priority, fmt(r.sla_due_at), r.ref]), link: `/workspace/${dept}` }
}

export async function buildDashboard(user: { id: string; role: Role; branch: string | null }): Promise<Dashboard> {
  const d: Dashboard = { role: user.role, kpis: [], tables: [], bars: [] }
  const b = user.branch
  switch (user.role) {
    case 'clerk': case 'field_agent': {
      d.kpis = [
        { key: 'drafts', label: 'My drafts', value: await n(`SELECT count(*) n FROM applications WHERE created_by=$1 AND status='DRAFT'`, [user.id]) },
        { key: 'submitted', label: 'Submitted / in approval', value: await n(`SELECT count(*) n FROM applications WHERE created_by=$1 AND status IN ${PENDING}`, [user.id]), tone: 'orange' },
        { key: 'returned', label: 'Returned for correction', value: await n(`SELECT count(*) n FROM applications WHERE created_by=$1 AND status='RETURNED'`, [user.id]), tone: 'red' },
        { key: 'opened', label: 'Accounts opened (30d)', value: await n(`SELECT count(*) n FROM applications WHERE created_by=$1 AND status='ACCOUNT_OPENED' AND updated_at > now()-interval '30 days'`, [user.id]), tone: 'green' },
      ]
      const rows = await q(`SELECT ref, applicant_name, status, updated_at, capture_channel, gps FROM applications WHERE created_by=$1 ORDER BY updated_at DESC LIMIT 12`, [user.id])
      d.tables.push({ key: 'mine', title: user.role === 'field_agent' ? 'My field captures' : 'My applications', columns: user.role === 'field_agent' ? ['Ref', 'Applicant', 'Status', 'Updated', 'GPS'] : ['Ref', 'Applicant', 'Status', 'Updated'], rows: rows.map((r) => [r.ref, r.applicant_name, r.status, fmt(r.updated_at), ...(user.role === 'field_agent' ? [r.gps ? `${Number(r.gps.lat).toFixed(4)}, ${Number(r.gps.lng).toFixed(4)}` : '—'] : [])]) })
      const dev = await q(`SELECT label, status, pending_items, last_sync_at FROM devices WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT 5`, [user.id])
      d.tables.push({ key: 'devices', title: 'My devices & sync status', columns: ['Device', 'Status', 'Pending items', 'Last sync'], rows: dev.map((r) => [r.label, r.status, r.pending_items, fmt(r.last_sync_at)]) })
      break
    }
    case 'branch_head': {
      d.kpis = [
        { key: 'pending', label: 'Awaiting my approval', value: await n(`SELECT count(*) n FROM applications WHERE branch_code=$1 AND status='PENDING_BRANCH_HEAD'`, [b]), tone: 'orange' },
        { key: 'sla', label: 'SLA breached', value: await n(`SELECT count(*) n FROM applications WHERE branch_code=$1 AND status IN ${PENDING} AND sla_due_at < now()`, [b]), tone: 'red' },
        { key: 'pipeline', label: 'In pipeline', value: await n(`SELECT count(*) n FROM applications WHERE branch_code=$1 AND status NOT IN ('ACCOUNT_OPENED','REJECTED')`, [b]) },
        { key: 'opened', label: 'Opened this month', value: await n(`SELECT count(*) n FROM applications WHERE branch_code=$1 AND status='ACCOUNT_OPENED' AND updated_at >= date_trunc('month', now())`, [b]), tone: 'green' },
      ]
      d.bars.push({ key: 'pipeline', title: 'Branch pipeline by status', items: (await q(`SELECT status label, count(*)::int value FROM applications WHERE branch_code=$1 GROUP BY status ORDER BY 2 DESC`, [b])) })
      const pend = await q(`SELECT ref, applicant_name, risk_rating, submitted_at, sla_due_at FROM applications WHERE branch_code=$1 AND status='PENDING_BRANCH_HEAD' ORDER BY sla_due_at LIMIT 10`, [b])
      d.tables.push({ key: 'pending', title: 'Pending approvals', columns: ['Ref', 'Applicant', 'Risk', 'Submitted', 'SLA due'], rows: pend.map((r) => [r.ref, r.applicant_name, r.risk_rating, fmt(r.submitted_at), fmt(r.sla_due_at)]), link: '/applications?pendingFor=me' })
      const prod = await q(`SELECT u.display_name, count(a.*)::int total, count(a.*) FILTER (WHERE a.status='ACCOUNT_OPENED')::int opened, count(a.*) FILTER (WHERE a.status='RETURNED')::int returned FROM users u LEFT JOIN applications a ON a.created_by=u.id WHERE u.branch_code=$1 AND u.role IN ('clerk','field_agent') GROUP BY u.display_name ORDER BY total DESC`, [b])
      d.tables.push({ key: 'productivity', title: 'Staff productivity', columns: ['Staff', 'Applications', 'Opened', 'Returned'], rows: prod.map((r) => [r.display_name, r.total, r.opened, r.returned]) })
      d.bars.push({ key: 'referrals', title: 'Referral sources', items: await q(`SELECT coalesce(referral_source,'—') label, count(*)::int value FROM applications WHERE branch_code=$1 GROUP BY 1 ORDER BY 2 DESC`, [b]) })
      d.bars.push({ key: 'staff_referrals', title: 'Staff referrals by staff code', items: await q(`SELECT referral_staff_code label, count(*)::int value FROM applications WHERE branch_code=$1 AND referral_source='staff' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [b]) })
      break
    }
    case 'operations': {
      d.kpis = [
        { key: 'queue', label: 'Awaiting Operations approval', value: await n(`SELECT count(*) n FROM applications WHERE status='PENDING_OPERATIONS'`), tone: 'orange' },
        { key: 'fallback', label: 'Flexcube fallbacks (manual)', value: await n(`SELECT count(*) n FROM applications WHERE status='FALLBACK_MANUAL'`), tone: 'red' },
        { key: 'core_err', label: 'Flexcube errors (7d)', value: await n(`SELECT count(*) n FROM integration_log WHERE system='flexcube' AND status='error' AND at > now()-interval '7 days'`), tone: 'red' },
        { key: 'svc_open', label: 'Open service requests', value: await n(`SELECT count(*) n FROM tasks WHERE type LIKE 'svc_%' AND status NOT IN ('done','rejected')`) },
      ]
      d.tables.push(await deptTable('operations', 'Operations queue (fallback / document QA)', 'ops'))
      d.bars.push({ key: 'svc', title: 'Service requests by type (open)', items: await q(`SELECT type label, count(*)::int value FROM tasks WHERE type LIKE 'svc_%' AND status NOT IN ('done','rejected') GROUP BY 1 ORDER BY 2 DESC`) })
      const svc = await q(`SELECT t.title, t.department, t.status, t.sla_due_at FROM tasks t WHERE t.type LIKE 'svc_%' ORDER BY t.created_at DESC LIMIT 10`)
      d.tables.push({ key: 'svc_track', title: 'Service-request tracking', columns: ['Request', 'Team', 'Status', 'SLA due'], rows: svc.map((r) => [r.title, r.department, r.status, fmt(r.sla_due_at)]) })
      break
    }
    case 'compliance': {
      d.kpis = [
        { key: 'aml', label: 'Open AML hits', value: await n(`SELECT count(*) n FROM tasks WHERE type='aml_hit' AND status NOT IN ('done','rejected')`), tone: 'red' },
        { key: 'edd', label: 'EDD in progress', value: await n(`SELECT count(*) n FROM tasks WHERE type='edd' AND status NOT IN ('done','rejected')`), tone: 'orange' },
        { key: 'pep', label: 'PEP / high-risk in pipeline', value: await n(`SELECT count(*) n FROM applications WHERE (risk_rating='high' OR aml_status='pep') AND status IN ${PENDING}`) },
        { key: 'kyc', label: 'KYC reviews due (30d)', value: await n(`SELECT count(*) n FROM customers WHERE kyc_next_review <= now()+interval '30 days'`) },
        { key: 'str', label: 'STRs flagged', value: await n(`SELECT count(*) n FROM tasks WHERE type='str'`) },
      ]
      d.tables.push(await deptTable('compliance', 'AML hits & EDD cases', 'cases', ['aml_hit', 'edd', 'str']))
      const kyc = await q(`SELECT cif, full_name, risk_rating, kyc_next_review, branch_code FROM customers WHERE kyc_next_review <= now()+interval '60 days' ORDER BY kyc_next_review LIMIT 10`)
      d.tables.push({ key: 'kyc', title: 'KYC expiry / refresh due', columns: ['CIF', 'Customer', 'Risk', 'Review due', 'Branch'], rows: kyc.map((r) => [r.cif, r.full_name, r.risk_rating, r.kyc_next_review, r.branch_code]) })
      d.bars.push({ key: 'risk', title: 'Risk rating mix (all applications)', items: await q(`SELECT risk_rating label, count(*)::int value FROM applications WHERE status<>'DRAFT' GROUP BY 1`) })
      break
    }
    case 'md': {
      d.kpis = [
        { key: 'opened_m', label: 'Accounts opened this month', value: await n(`SELECT count(*) n FROM applications WHERE status='ACCOUNT_OPENED' AND updated_at >= date_trunc('month', now())`), tone: 'green' },
        { key: 'pending_md', label: 'Exceptions awaiting MD/CEO', value: await n(`SELECT count(*) n FROM applications WHERE status='PENDING_MD'`), tone: 'orange' },
        { key: 'tat', label: 'Median hours submit→decision', value: Number((await one(`SELECT coalesce(round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch from decided_at-submitted_at)/3600))::numeric,1),0) n FROM applications WHERE decided_at IS NOT NULL`))?.n ?? 0) },
        { key: 'ftr', label: 'First-time-right %', value: `${await n(`SELECT coalesce(round(100.0*count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM approvals p WHERE p.application_id=a.id AND p.decision='return'))/nullif(count(*),0)),0) n FROM applications a WHERE status='ACCOUNT_OPENED'`)}%` },
        { key: 'fallback', label: 'Flexcube fallback rate', value: `${await n(`SELECT coalesce(round(100.0*count(*) FILTER (WHERE core_status='manual' OR status='FALLBACK_MANUAL')/nullif(count(*) FILTER (WHERE status IN ('ACCOUNT_OPENED','FALLBACK_MANUAL')),0)),0) n FROM applications`)}%`, tone: 'red' },
      ]
      const ex = await q(`SELECT ref, applicant_name, branch_code, risk_rating, aml_status, submitted_at FROM applications WHERE status='PENDING_MD' ORDER BY submitted_at LIMIT 10`)
      d.tables.push({ key: 'exceptions', title: 'Exceptional cases awaiting your decision', columns: ['Ref', 'Applicant', 'Branch', 'Risk', 'AML', 'Submitted'], rows: ex.map((r) => [r.ref, r.applicant_name, r.branch_code, r.risk_rating, r.aml_status, fmt(r.submitted_at)]), link: '/applications?pendingFor=me' })
      const br = await q(`SELECT b.name, count(a.*)::int total, count(a.*) FILTER (WHERE a.status='ACCOUNT_OPENED')::int opened, count(a.*) FILTER (WHERE a.status IN ${PENDING})::int pending, count(a.*) FILTER (WHERE a.sla_due_at < now() AND a.status IN ${PENDING})::int breached FROM branches b LEFT JOIN applications a ON a.branch_code=b.code GROUP BY b.name ORDER BY total DESC`)
      d.tables.push({ key: 'branches', title: 'Branch comparison', columns: ['Branch', 'Applications', 'Opened', 'Pending', 'SLA breached'], rows: br.map((r) => [r.name, r.total, r.opened, r.pending, r.breached]) })
      d.bars.push({ key: 'mix', title: 'Product mix (opened)', items: await q(`SELECT coalesce(p.names->>'en', a.product_code) label, count(*)::int value FROM applications a LEFT JOIN products p ON p.code=a.product_code WHERE a.status='ACCOUNT_OPENED' GROUP BY 1 ORDER BY 2 DESC`) })
      d.bars.push({ key: 'channel', title: 'Capture channel', items: await q(`SELECT capture_channel label, count(*)::int value FROM applications GROUP BY 1`) })
      break
    }
    case 'auditor': {
      d.kpis = [
        { key: 'events', label: 'Audit events (30d)', value: await n(`SELECT count(*) n FROM audit_events WHERE at > now()-interval '30 days'`) },
        { key: 'samples', label: 'Open samples', value: await n(`SELECT count(*) n FROM tasks WHERE type='audit_sample' AND status NOT IN ('done')`), tone: 'orange' },
        { key: 'findings', label: 'Open findings', value: await n(`SELECT count(*) n FROM tasks WHERE type='audit_finding' AND status NOT IN ('done')`), tone: 'red' },
        { key: 'failed_logins', label: 'Failed logins (7d)', value: await n(`SELECT count(*) n FROM audit_events WHERE action='auth.login_failed' AND at > now()-interval '7 days'`) },
      ]
      const ev = await q(`SELECT at, actor_name, actor_role, action, entity_id FROM audit_events ORDER BY id DESC LIMIT 12`)
      d.tables.push({ key: 'recent', title: 'Recent audit events', columns: ['When', 'Actor', 'Role', 'Action', 'Entity'], rows: ev.map((r) => [fmt(r.at), r.actor_name, r.actor_role, r.action, r.entity_id]), link: '/audit' })
      d.bars.push({ key: 'actions', title: 'Top actions (30d)', items: await q(`SELECT action label, count(*)::int value FROM audit_events WHERE at > now()-interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`) })
      break
    }
    case 'admin': case 'it': {
      d.kpis = [
        { key: 'users', label: 'Active users', value: await n(`SELECT count(*) n FROM users WHERE active`) },
        { key: 'devices', label: 'Registered devices', value: await n(`SELECT count(*) n FROM devices`) },
        { key: 'locked', label: 'Locked / wipe pending', value: await n(`SELECT count(*) n FROM devices WHERE status IN ('locked','wipe_pending')`), tone: 'red' },
        { key: 'int_err', label: 'Integration errors (24h)', value: await n(`SELECT count(*) n FROM integration_log WHERE status='error' AND at > now()-interval '1 day'`), tone: 'red' },
        { key: 'products', label: 'Active products', value: await n(`SELECT count(*) n FROM products WHERE active`) },
      ]
      d.bars.push({ key: 'roles', title: 'Users by role', items: await q(`SELECT role label, count(*)::int value FROM users WHERE active GROUP BY 1 ORDER BY 2 DESC`) })
      const errs = await q(`SELECT at, system, operation, error FROM integration_log WHERE status='error' ORDER BY id DESC LIMIT 8`)
      d.tables.push({ key: 'errors', title: 'Latest integration errors', columns: ['When', 'System', 'Operation', 'Error'], rows: errs.map((r) => [fmt(r.at), r.system, r.operation, r.error]), link: '/it' })
      break
    }
    case 'digital': case 'cards': case 'customer_service': case 'risk': {
      const dept = user.role
      d.kpis = [
        { key: 'open', label: 'Open requests', value: await n(`SELECT count(*) n FROM tasks WHERE department=$1 AND status NOT IN ('done','rejected')`, [dept]), tone: 'orange' },
        { key: 'breach', label: 'SLA breached', value: await n(`SELECT count(*) n FROM tasks WHERE department=$1 AND status NOT IN ('done','rejected') AND sla_due_at<now()`, [dept]), tone: 'red' },
        { key: 'done', label: 'Completed (7d)', value: await n(`SELECT count(*) n FROM tasks WHERE department=$1 AND status='done' AND closed_at > now()-interval '7 days'`, [dept]), tone: 'green' },
      ]
      if (dept === 'customer_service' || dept === 'risk') {
        d.bars.push({ key: 'referrals', title: 'Referral sources (all branches)', items: await q(`SELECT coalesce(referral_source,'—') label, count(*)::int value FROM applications GROUP BY 1 ORDER BY 2 DESC`) })
        if (dept === 'risk') d.bars.push({ key: 'risk', title: 'Risk distribution', items: await q(`SELECT risk_rating label, count(*)::int value FROM applications WHERE status<>'DRAFT' GROUP BY 1`) })
        if (dept === 'risk') d.bars.push({ key: 'factors', title: 'Top risk factors', items: await q(`SELECT f label, count(*)::int value FROM applications, jsonb_array_elements_text(risk_factors) f GROUP BY 1 ORDER BY 2 DESC LIMIT 8`) })
      } else d.bars.push({ key: 'types', title: 'Open by request type', items: await q(`SELECT type label, count(*)::int value FROM tasks WHERE department=$1 AND status NOT IN ('done','rejected') GROUP BY 1`, [dept]) })
      d.tables.push(await deptTable(dept, 'My queue', 'queue'))
      break
    }
  }
  return d
}
export const dashboard = Router()
dashboard.get('/', async (req, res) => res.json(await buildDashboard(req.user!)))
