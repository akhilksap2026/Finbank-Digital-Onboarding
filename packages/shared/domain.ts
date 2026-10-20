// Shared domain model for FinBank digital account opening (API + web).
export type Lang = 'fr' | 'en' | 'rn'
export type CustomerType = 'individual' | 'joint' | 'corporate'
export type ApplicationKind = 'new_customer' | 'additional_account' | 'kyc_update'
export type Currency = 'BIF' | 'USD' | 'EUR'
export type Role =
  | 'clerk' | 'field_agent' | 'branch_head' | 'operations' | 'compliance' | 'md' | 'auditor' | 'admin'
  | 'it' | 'digital' | 'cards' | 'customer_service' | 'risk'

export type AppStatus =
  | 'DRAFT' | 'PENDING_BRANCH_HEAD' | 'PENDING_OPERATIONS' | 'PENDING_COMPLIANCE' | 'PENDING_MD'
  | 'RETURNED' | 'REJECTED' | 'APPROVED' | 'ACCOUNT_OPENED' | 'FALLBACK_MANUAL'

export const PENDING_STATUS_BY_ROLE: Record<string, AppStatus> = {
  branch_head: 'PENDING_BRANCH_HEAD', operations: 'PENDING_OPERATIONS', compliance: 'PENDING_COMPLIANCE', md: 'PENDING_MD',
}

export interface Address { residence: string; quarter: string; avenue: string; town: string; commune: string; province: string; country: string; postalBox: string }

export interface Person {
  id: string
  roles: Array<'holder' | 'director' | 'signatory' | 'beneficial_owner' | 'mandatee' | 'guardian' | 'operator'>
  firstName: string; lastName: string; sex: string; dateOfBirth: string; placeOfBirth: string; nationality: string; maritalStatus: string
  idType: 'cni' | 'passport' | 'driving_licence' | 'refugee_card' | 'birth_certificate' | ''
  idNumber: string; idExpiry: string; nif: string
  phone: string; officePhone: string; email: string; address: Address
  occupation: string; profession: string; jobTitle: string; selfEmployed: boolean; employerName: string; annualIncome: string
  designation: string; ownershipPct: string; votingPct: string
  pep: boolean; pepDetails: string
  relationshipToMinor: string
}

export interface Entity {
  legalName: string; legalStatus: 'sole_proprietor' | 'limited_company' | 'government' | 'partnership' | 'semi_public' | 'public_company' | 'ngo' | 'society_trust' | 'other' | ''
  legalStatusOther: string; registrationNumber: string; incorporationDate: string; nif: string
  postalBox: string; town: string; phone: string; mobile: string; fax: string; email: string; physicalAddress: string; website: string
  businessActivity: string; annualTurnover: string; shareCapital: string
}

export interface OtherAccount { accountName: string; bankBranch: string; accountType: string; accountNumber: string }
export interface IncomeSource { source: 'salary' | 'business' | 'property_sale' | 'other'; amount: string; detail?: string }
export interface Introducer { name: string; companyDesignation: string; address: string; finbankAccount: string; phone: string; officePhone: string; mobile: string; yearsKnown: string }
export interface Mandate { personId: string; idNumber: string; noLimit: boolean; limitAmount: string; limitCurrency: Currency; powers: Array<'cash_withdrawal' | 'balance_enquiry' | 'cheque_book_collection' | 'account_history' | 'other'>; otherPower: string }
export interface FinConnectOperator { personId: string; role: 'admin' | 'operator' | 'viewer'; accounts: string[]; canInitiate: boolean; canApprove: boolean; canView: boolean; limitAmount: string; limitScope: 'per_transaction' | 'per_day' }

export interface Services {
  chequeBook: boolean; chequeLeaves: '20' | '40'; chequeBooks: number
  mobileBanking: boolean; pesaflash: boolean; pesaflashLanguage: Lang; ecocash: boolean; ecocashAgent: boolean; ecocashAgentCode: string; econetNumber: string
  eStatement: boolean; eStatementEmail: string; internetBanking: boolean; finconnect: boolean; finconnectOtpChannel: 'mobile' | 'email' | 'both'
  transferOrderBooklet: boolean
}

export type ReferralSource = 'staff' | 'existing_customer' | 'agent' | 'walk_in' | 'social_media' | 'advertisement'

export interface ApplicationData {
  account: { productCode: string; currency: Currency; currencyOther: string; accountName: string; purpose: string; expectedMonthlyInflow: string; expectedMonthlyOutflow: string; transactionCountries: string[] }
  entity: Entity
  people: Person[]
  otherAccounts: OtherAccount[]
  incomeSources: IncomeSource[]
  sourceOfWealth: string
  introducer: Introducer
  signing: { rule: 'singly' | 'jointly' | 'either' | 'other' | ''; otherInstructions: string }
  mandates: Mandate[]
  operators: FinConnectOperator[]
  services: Services
  declarations: { actingForSelf: boolean; thirdPartyDetails: string; accuracyConfirmed: boolean; consentDataProcessing: boolean; consentMarketing: boolean; rgoAcknowledged: boolean }
  referral: { source: ReferralSource | ''; staffCode: string; detail: string }
  verification: { idVerifiedByStaff: boolean; idVerifiedNote: string; otpPlaceholderVerified: boolean }
  kycUpdate?: { changedFields: string[]; reason: string }
  exceptions: Array<{ code: 'min_deposit_waiver' | 'document_deferral' | 'other'; reason: string }>
}

export const DOC_TYPES = [
  'id_copy', 'passport_photo', 'proof_of_address', 'residence_certificate', 'birth_certificate', 'guardian_id',
  'salary_letter', 'nif_certificate', 'trade_register', 'articles', 'incorporation_certificate', 'board_resolution',
  'partnership_deed', 'business_address_proof', 'signatory_address_proof', 'signed_form_scan', 'diaspora_proof', 'other',
] as const
export type DocType = typeof DOC_TYPES[number]

export function emptyAddress(): Address { return { residence: '', quarter: '', avenue: '', town: '', commune: '', province: '', country: 'Burundi', postalBox: '' } }
export function emptyPerson(id: string, role: Person['roles'][number] = 'holder'): Person {
  return { id, roles: [role], firstName: '', lastName: '', sex: '', dateOfBirth: '', placeOfBirth: '', nationality: 'Burundaise', maritalStatus: '', idType: 'cni', idNumber: '', idExpiry: '', nif: '', phone: '', officePhone: '', email: '', address: emptyAddress(), occupation: '', profession: '', jobTitle: '', selfEmployed: false, employerName: '', annualIncome: '', designation: '', ownershipPct: '', votingPct: '', pep: false, pepDetails: '', relationshipToMinor: '' }
}
export function emptyApplicationData(): ApplicationData {
  return {
    account: { productCode: '', currency: 'BIF', currencyOther: '', accountName: '', purpose: '', expectedMonthlyInflow: '', expectedMonthlyOutflow: '', transactionCountries: ['Burundi'] },
    entity: { legalName: '', legalStatus: '', legalStatusOther: '', registrationNumber: '', incorporationDate: '', nif: '', postalBox: '', town: '', phone: '', mobile: '', fax: '', email: '', physicalAddress: '', website: '', businessActivity: '', annualTurnover: '', shareCapital: '' },
    people: [emptyPerson('p1')], otherAccounts: [], incomeSources: [], sourceOfWealth: '',
    introducer: { name: '', companyDesignation: '', address: '', finbankAccount: '', phone: '', officePhone: '', mobile: '', yearsKnown: '' },
    signing: { rule: '', otherInstructions: '' }, mandates: [], operators: [],
    services: { chequeBook: false, chequeLeaves: '20', chequeBooks: 1, mobileBanking: false, pesaflash: false, pesaflashLanguage: 'fr', ecocash: false, ecocashAgent: false, ecocashAgentCode: '', econetNumber: '', eStatement: false, eStatementEmail: '', internetBanking: false, finconnect: false, finconnectOtpChannel: 'mobile', transferOrderBooklet: false },
    declarations: { actingForSelf: true, thirdPartyDetails: '', accuracyConfirmed: false, consentDataProcessing: false, consentMarketing: false, rgoAcknowledged: false },
    referral: { source: '', staffCode: '', detail: '' },
    verification: { idVerifiedByStaff: false, idVerifiedNote: '', otpPlaceholderVerified: false },
    exceptions: [],
  }
}
