import type { ApplicationData, CustomerType } from '../../../../packages/shared/domain'
export interface RiskConfig { weights: Record<string, number>; thresholds: { medium: number; high: number }; highRiskCountries: string[]; highInflowBIF: number; highRiskActivities: string[] }
export const DEFAULT_RISK: RiskConfig = {
  weights: { pep: 40, aml_potential_match: 30, aml_sanctioned: 100, foreign_national: 10, third_party: 20, high_risk_country: 25, high_inflow: 15, complex_entity: 15, high_risk_activity: 20, exceptions: 10 },
  thresholds: { medium: 25, high: 50 },
  highRiskCountries: ['Iran', 'North Korea', 'Myanmar'],
  highInflowBIF: 50_000_000,
  highRiskActivities: ['bureau de change', 'casino', 'mining', 'precious metals', 'real estate'],
}
export function scoreRisk(customerType: CustomerType, data: ApplicationData, aml: Array<{ result: string }>, cfg: RiskConfig = DEFAULT_RISK) {
  const f: string[] = []
  if (data.people.some((p) => p.pep) || aml.some((a) => a.result === 'pep')) f.push('pep')
  if (aml.some((a) => a.result === 'potential_match')) f.push('aml_potential_match')
  if (aml.some((a) => a.result === 'sanctioned')) f.push('aml_sanctioned')
  if (data.people.some((p) => p.roles.includes('holder') && p.nationality && !/burund/i.test(p.nationality))) f.push('foreign_national')
  if (!data.declarations.actingForSelf) f.push('third_party')
  if (data.account.transactionCountries.some((c) => cfg.highRiskCountries.map((x) => x.toLowerCase()).includes(c.toLowerCase()))) f.push('high_risk_country')
  if (Number(data.account.expectedMonthlyInflow) >= cfg.highInflowBIF) f.push('high_inflow')
  if (customerType === 'corporate' && ['ngo', 'society_trust', 'other'].includes(data.entity.legalStatus)) f.push('complex_entity')
  const act = `${data.entity.businessActivity} ${data.people.map((p) => p.occupation).join(' ')}`.toLowerCase()
  if (cfg.highRiskActivities.some((a) => act.includes(a))) f.push('high_risk_activity')
  if ((data.exceptions ?? []).length) f.push('exceptions')
  const score = Math.min(100, f.reduce((s, k) => s + (cfg.weights[k] ?? 0), 0))
  const rating = score >= cfg.thresholds.high ? 'high' : score >= cfg.thresholds.medium ? 'medium' : 'low'
  return { score, rating: rating as 'low' | 'medium' | 'high', factors: f }
}

export interface Cond { field: string; eq?: unknown; in?: unknown[]; gte?: number }
export interface RuleCondition { any?: Cond[]; all?: Cond[] }
export function matches(c: RuleCondition, facts: Record<string, unknown>) {
  const t = (x: Cond) => { const v = facts[x.field]; if (x.eq !== undefined) return v === x.eq; if (x.in) return x.in.includes(v); if (x.gte !== undefined) return Number(v) >= x.gte; return false }
  if (c.all && !c.all.every(t)) return false
  if (c.any && !c.any.some(t)) return false
  return !!(c.all?.length || c.any?.length)
}
const ORDER = ['branch_head', 'operations', 'compliance', 'md']
export function buildChain(rules: Array<{ condition: RuleCondition; add_role: string; active: boolean }>, facts: Record<string, unknown>) {
  const roles = new Set(['branch_head'])
  for (const r of rules) if (r.active && matches(r.condition, facts)) roles.add(r.add_role)
  return ORDER.filter((r) => roles.has(r))
}
