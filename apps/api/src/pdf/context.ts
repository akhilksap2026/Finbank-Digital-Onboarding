import { one, q } from '../db/pool'
import type { PdfContext } from './forms'
export async function buildPdfContext(app: any): Promise<PdfContext> {
  const product = app.product_code ? await one('SELECT * FROM products WHERE code=$1', [app.product_code]) : null
  const branch = await one('SELECT * FROM branches WHERE code=$1', [app.branch_code])
  const approvals = await q('SELECT a.*, u.display_name FROM approvals a JOIN users u ON u.id=a.actor_id WHERE application_id=$1 ORDER BY at', [app.id])
  const maker = await one('SELECT display_name FROM users WHERE id=$1', [app.created_by])
  const screenings = await q('SELECT party_name, result, score FROM aml_screenings WHERE application_id=$1', [app.id])
  const appr = approvals.filter((a) => a.decision === 'approve')
  return {
    ref: app.ref, customerType: app.customer_type, kind: app.kind, productCode: app.product_code ?? '', productName: product?.names?.fr ?? '', formTypeLabel: product?.form_type_label ?? 'current',
    branchName: branch?.name ?? app.branch_code, branchCode: app.branch_code, date: (app.submitted_at ?? app.created_at).toISOString?.() ?? String(app.created_at), accountNumber: app.account_number, cif: app.cif, data: app.data,
    bank: {
      openedBy: maker?.display_name, authorizedBy: appr.at(-1)?.display_name, idVerified: !!app.data.verification?.idVerifiedByStaff, amlDone: app.aml_status !== 'not_run', amlStatus: app.aml_status,
      riskRating: app.risk_rating, riskScore: app.risk_score, riskFactors: app.risk_factors ?? [],
      exceptionsApprovedBy: (app.data.exceptions ?? []).length ? appr.find((a) => ['operations', 'compliance', 'md'].includes(a.step_role))?.display_name : undefined,
      managerApproval: appr.find((a) => a.step_role === 'md')?.display_name ?? appr.find((a) => a.step_role === 'branch_head')?.display_name,
      referenceVerifiedBy: app.data.introducer?.name ? appr.find((a) => a.step_role === 'branch_head')?.display_name : undefined,
      approvals: approvals.map((a) => ({ role: a.step_role, name: a.display_name, decision: a.decision, at: new Date(a.at).toISOString(), comment: a.comment })),
      screenings: screenings.map((s) => ({ name: s.party_name, result: s.result, score: s.score })),
    },
  }
}
