import { describe, expect, it } from 'vitest'
import { isBurundiPhone, isNif, ageOn, validateApplication } from '../../../packages/shared/validation'
import { sampleIndividual, sampleCorporate } from '../src/db/seed'
import { scoreRisk, buildChain } from '../src/services/risk'
import { buildCreateCustAccXml, buildCreateCustomerXml } from '../src/adapters/flexcube'

describe('validation', () => {
  it('phones and NIF', () => {
    expect(isBurundiPhone('+257 79 123 456')).toBe(true); expect(isBurundiPhone('79123456')).toBe(false)
    expect(isNif('4000123456')).toBe(true); expect(isNif('NIF-1')).toBe(false)
  })
  it('age', () => { expect(ageOn('2000-10-21', new Date('2026-10-20'))).toBe(25) })
  it('sample individual is valid', () => { expect(validateApplication('individual', sampleIndividual(), { code: 'CUR', customerTypes: ['individual', 'joint', 'corporate'], currencies: ['BIF', 'USD', 'EUR'] })).toEqual([]) })
  it('sample corporate is valid', () => { expect(validateApplication('corporate', sampleCorporate(), { code: 'CUR', customerTypes: ['individual', 'joint', 'corporate'], currencies: ['BIF', 'USD', 'EUR'] })).toEqual([]) })
  it('flags minors, expired IDs, missing staff code, missing UBO (assessment bugs fixed)', () => {
    const d = sampleIndividual(); d.people[0].dateOfBirth = '2015-01-01'; d.people[0].idType = 'passport'; d.people[0].idExpiry = '2020-01-01'; d.referral = { source: 'staff', staffCode: '', detail: '' }
    const codes = validateApplication('individual', d).map((i) => i.code)
    expect(codes).toContain('minor'); expect(codes).toContain('expired'); expect(codes.filter((c) => c === 'required').length).toBeGreaterThan(0)
    const c = sampleCorporate(); c.people.forEach((p) => (p.roles = p.roles.filter((r) => r !== 'beneficial_owner')))
    expect(validateApplication('corporate', c).map((i) => i.code)).toContain('ubo_required')
  })
  it('FinConnect operators without FinConnect are rejected', () => {
    const d = sampleCorporate(); d.services.finconnect = false
    expect(validateApplication('corporate', d).map((i) => i.code)).toContain('finconnect_not_requested')
  })
  it('joint needs two holders', () => { expect(validateApplication('joint', sampleIndividual()).map((i) => i.code)).toContain('joint_two_holders') })
})
describe('risk & routing', () => {
  it('PEP routes to compliance; very high risk adds MD', () => {
    const d = sampleIndividual(); d.people[0].pep = true; d.people[0].pepDetails = 'x'
    const r = scoreRisk('individual', d, [{ result: 'pep' }])
    expect(r.factors).toContain('pep')
    const rules = [{ condition: { any: [{ field: 'pep', eq: true }] }, add_role: 'compliance', active: true }, { condition: { any: [{ field: 'riskScore', gte: 80 }] }, add_role: 'md', active: true }]
    expect(buildChain(rules, { pep: true, riskScore: 40 })).toEqual(['branch_head', 'compliance'])
    expect(buildChain(rules, { pep: true, riskScore: 90 })).toEqual(['branch_head', 'compliance', 'md'])
  })
})
describe('flexcube gateway XML', () => {
  it('builds FCUBS envelopes', () => {
    const x = buildCreateCustomerXml({ msgId: 'M1', branch: '001', customerType: 'I', shortName: 'A', fullName: 'A & B', nationality: 'BI', address1: 'x', category: 'INDIVIDUAL' })
    expect(x).toContain('<SERVICE>FCUBSCustomerService</SERVICE>'); expect(x).toContain('<OPERATION>CreateCustomer</OPERATION>'); expect(x).toContain('A &amp; B')
    expect(buildCreateCustAccXml({ msgId: 'M2', branch: '001', cif: '1', accountClass: 'CACUR', currency: 'BIF', accountName: 'n' })).toContain('CREATECUSTACC_IOPK_REQ')
  })
})
