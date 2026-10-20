import type { ApplicationData, CustomerType, Person } from './domain'

export interface Issue { path: string; code: string; message: string }
export interface ProductRule { code: string; customerTypes: CustomerType[]; currencies: string[]; minAge?: number | null; maxAge?: number | null; requiresGuardian?: boolean; requiresEmployer?: boolean; requiresDiasporaProof?: boolean }

// Burundi mobile: +257 followed by 8 digits (e.g. +257 79 123 456). Accepts spaces.
export function isBurundiPhone(v: string): boolean { return /^\+257\d{8}$/.test(v.replace(/[\s-]/g, '')) }
export function isPhone(v: string): boolean { const s = v.replace(/[\s-]/g, ''); return isBurundiPhone(s) || /^\+\d{8,15}$/.test(s) }
export function isEmail(v: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) }
// NIF (Numéro d'Identification Fiscale) in Burundi is a 10-digit number; tolerate spaces.
export function isNif(v: string): boolean { return /^\d{10}$/.test(v.replace(/\s/g, '')) }
export function ageOn(dob: string, at = new Date()): number {
  const d = new Date(dob); if (Number.isNaN(d.getTime())) return NaN
  let a = at.getFullYear() - d.getFullYear(); const m = at.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) a--
  return a
}
export function isFutureDate(v: string, at = new Date()): boolean { const d = new Date(v); return !Number.isNaN(d.getTime()) && d.getTime() > at.getTime() }

export function validatePerson(p: Person, path: string, opts: { minor?: boolean } = {}): Issue[] {
  const out: Issue[] = []
  const req = (field: keyof Person, label: string) => { if (!String(p[field] ?? '').trim()) out.push({ path: `${path}.${String(field)}`, code: 'required', message: `${label} is required` }) }
  req('firstName', 'First name'); req('lastName', 'Last name'); req('dateOfBirth', 'Date of birth'); req('idNumber', 'ID number')
  if (p.dateOfBirth) {
    const age = ageOn(p.dateOfBirth)
    if (Number.isNaN(age) || age < 0 || age > 120) out.push({ path: `${path}.dateOfBirth`, code: 'invalid', message: 'Invalid date of birth' })
    else if (!opts.minor && age < 18 && !p.roles.includes('beneficial_owner')) out.push({ path: `${path}.dateOfBirth`, code: 'minor', message: 'Holder must be 18 or older (use the Akabirya product for minors)' })
    else if (opts.minor && age >= 18) out.push({ path: `${path}.dateOfBirth`, code: 'not_minor', message: 'Akabirya is reserved for minors under 18' })
  }
  if (p.idType !== 'birth_certificate') {
    if (!p.idExpiry && p.idType !== 'cni') out.push({ path: `${path}.idExpiry`, code: 'required', message: 'ID expiry is required' })
    if (p.idExpiry && !isFutureDate(p.idExpiry)) out.push({ path: `${path}.idExpiry`, code: 'expired', message: 'Identity document is expired' })
  }
  if (p.phone && !isPhone(p.phone)) out.push({ path: `${path}.phone`, code: 'format', message: 'Phone must be in international format, e.g. +257 79 123 456' })
  if (p.email && !isEmail(p.email)) out.push({ path: `${path}.email`, code: 'format', message: 'Invalid e-mail' })
  if (p.nif && !isNif(p.nif)) out.push({ path: `${path}.nif`, code: 'format', message: 'NIF must have 10 digits' })
  if (p.pep && !p.pepDetails.trim()) out.push({ path: `${path}.pepDetails`, code: 'required', message: 'PEP details are required' })
  return out
}

/** Full business validation used before submission (server-side authoritative, reused by the client). */
export function validateApplication(customerType: CustomerType, data: ApplicationData, product?: ProductRule): Issue[] {
  const issues: Issue[] = []
  const minor = !!product?.requiresGuardian
  if (!data.account.productCode) issues.push({ path: 'account.productCode', code: 'required', message: 'Product is required' })
  if (product && !product.customerTypes.includes(customerType)) issues.push({ path: 'account.productCode', code: 'not_eligible', message: 'Product not available for this customer type' })
  if (product && !product.currencies.includes(data.account.currency)) issues.push({ path: 'account.currency', code: 'not_eligible', message: 'Currency not offered for this product' })
  if (!data.account.accountName.trim()) issues.push({ path: 'account.accountName', code: 'required', message: 'Account name is required' })
  if (!data.account.purpose.trim()) issues.push({ path: 'account.purpose', code: 'required', message: 'Account purpose is required' })

  const holders = data.people.filter((p) => p.roles.includes('holder'))
  if (customerType === 'corporate') {
    const e = data.entity
    for (const [k, label] of [['legalName', 'Company name'], ['legalStatus', 'Legal status'], ['registrationNumber', 'Registration number'], ['incorporationDate', 'Incorporation date'], ['nif', 'NIF'], ['physicalAddress', 'Physical address'], ['businessActivity', 'Business activity']] as const) {
      if (!String(e[k]).trim()) issues.push({ path: `entity.${k}`, code: 'required', message: `${label} is required` })
    }
    if (e.legalStatus === 'other' && !e.legalStatusOther.trim()) issues.push({ path: 'entity.legalStatusOther', code: 'required', message: 'Specify legal status' })
    if (e.nif && !isNif(e.nif)) issues.push({ path: 'entity.nif', code: 'format', message: 'NIF must have 10 digits' })
    if (e.email && !isEmail(e.email)) issues.push({ path: 'entity.email', code: 'format', message: 'Invalid e-mail' })
    if (e.incorporationDate && isFutureDate(e.incorporationDate)) issues.push({ path: 'entity.incorporationDate', code: 'invalid', message: 'Incorporation date cannot be in the future' })
    if (!data.people.some((p) => p.roles.includes('director'))) issues.push({ path: 'people', code: 'director_required', message: 'At least one director/partner is required' })
    if (!data.people.some((p) => p.roles.includes('signatory'))) issues.push({ path: 'people', code: 'signatory_required', message: 'At least one authorised signatory is required' })
    if (!data.people.some((p) => p.roles.includes('beneficial_owner'))) issues.push({ path: 'people', code: 'ubo_required', message: 'At least one beneficial owner is required (BRB AML regulation)' })
    const ubo = data.people.filter((p) => p.roles.includes('beneficial_owner')).reduce((s, p) => s + (Number(p.ownershipPct) || 0), 0)
    if (ubo > 100) issues.push({ path: 'people', code: 'ownership_over_100', message: 'Beneficial ownership exceeds 100%' })
    if (!data.signing.rule) issues.push({ path: 'signing.rule', code: 'required', message: 'Signing instruction is required' })
  } else {
    if (minor) {
      const minorP = holders[0]
      if (!minorP) issues.push({ path: 'people', code: 'holder_required', message: 'Minor holder is required' })
      if (!data.people.some((p) => p.roles.includes('guardian'))) issues.push({ path: 'people', code: 'guardian_required', message: 'A legal guardian is required for Akabirya' })
    } else if (customerType === 'joint' && holders.length < 2) issues.push({ path: 'people', code: 'joint_two_holders', message: 'A joint account needs at least two holders' })
    else if (holders.length < 1) issues.push({ path: 'people', code: 'holder_required', message: 'At least one holder is required' })
    if (customerType === 'joint' && !data.signing.rule) issues.push({ path: 'signing.rule', code: 'required', message: 'Signing instruction is required' })
    if (data.incomeSources.length === 0 && !minor) issues.push({ path: 'incomeSources', code: 'required', message: 'At least one source of income is required' })
  }
  data.people.forEach((p, i) => {
    const isMinorHolder = minor && p.roles.includes('holder')
    issues.push(...validatePerson(p, `people[${i}]`, { minor: isMinorHolder }))
    if ((p.roles.includes('holder') || p.roles.includes('guardian')) && customerType !== 'corporate') {
      if (!p.address.residence && !p.address.quarter) issues.push({ path: `people[${i}].address`, code: 'required', message: 'Residence / quarter is required' })
      if (!p.address.commune || !p.address.province) issues.push({ path: `people[${i}].address`, code: 'required', message: 'Commune and province are required' })
      if (!isMinorHolder && !p.phone) issues.push({ path: `people[${i}].phone`, code: 'required', message: 'Phone is required' })
    }
  })
  if (data.signing.rule === 'other' && !data.signing.otherInstructions.trim()) issues.push({ path: 'signing.otherInstructions', code: 'required', message: 'Specify other signing instructions' })
  data.mandates.forEach((m, i) => {
    if (!data.people.some((p) => p.id === m.personId)) issues.push({ path: `mandates[${i}].personId`, code: 'orphan', message: 'Mandatee must be a listed person' })
    if (!m.noLimit && !(Number(m.limitAmount) > 0)) issues.push({ path: `mandates[${i}].limitAmount`, code: 'required', message: 'Limit amount required unless "no limit"' })
    if (m.powers.length === 0) issues.push({ path: `mandates[${i}].powers`, code: 'required', message: 'Select at least one power' })
  })
  if (data.operators.length && !data.services.finconnect) issues.push({ path: 'operators', code: 'finconnect_not_requested', message: 'FinConnect operators configured but FinConnect not requested' })
  if (data.services.finconnect && data.operators.length === 0) issues.push({ path: 'operators', code: 'required', message: 'FinConnect requires at least one operator' })
  data.operators.forEach((o, i) => { if (!data.people.some((p) => p.id === o.personId)) issues.push({ path: `operators[${i}].personId`, code: 'orphan', message: 'Operator must be a listed person' }) })
  if (data.services.eStatement && !isEmail(data.services.eStatementEmail)) issues.push({ path: 'services.eStatementEmail', code: 'required', message: 'E-statement e-mail required' })
  if (data.services.ecocashAgent && !data.services.ecocashAgentCode.trim()) issues.push({ path: 'services.ecocashAgentCode', code: 'required', message: 'Ecocash agent code required' })
  if (!data.declarations.accuracyConfirmed) issues.push({ path: 'declarations.accuracyConfirmed', code: 'required', message: 'Accuracy declaration required' })
  if (!data.declarations.consentDataProcessing) issues.push({ path: 'declarations.consentDataProcessing', code: 'required', message: 'Data-processing consent required (Law 1/03 of 2026)' })
  if (!data.declarations.rgoAcknowledged) issues.push({ path: 'declarations.rgoAcknowledged', code: 'required', message: 'Acknowledgement of the Règlement Général des Opérations required' })
  if (!data.declarations.actingForSelf && !data.declarations.thirdPartyDetails.trim()) issues.push({ path: 'declarations.thirdPartyDetails', code: 'required', message: 'Details of the person on whose behalf the account is opened are required' })
  if (!data.referral.source) issues.push({ path: 'referral.source', code: 'required', message: 'Referral source is required' })
  if (data.referral.source === 'staff' && !/^[A-Z0-9]{3,10}$/i.test(data.referral.staffCode)) issues.push({ path: 'referral.staffCode', code: 'required', message: 'Staff code is required when referred by staff' })
  if (!data.verification.idVerifiedByStaff) issues.push({ path: 'verification.idVerifiedByStaff', code: 'required', message: 'Staff must confirm original ID documents were sighted and verified' })
  return issues
}
