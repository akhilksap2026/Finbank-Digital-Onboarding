import type { Role } from '../../../packages/shared/domain'

export type Permission =
  | 'app.create' | 'app.read.own' | 'app.read.branch' | 'app.read.all' | 'app.approve'
  | 'customer.search' | 'customer.lookup_status'
  | 'dept.work' | 'audit.read' | 'audit.export' | 'audit.findings'
  | 'admin.users' | 'admin.catalog' | 'admin.rules' | 'admin.integrations'
  | 'it.devices' | 'it.logs' | 'it.retry' | 'risk.config' | 'pdf.generate' | 'core.manual_open' | 'compliance.cases'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  clerk: ['app.create', 'app.read.own', 'customer.search', 'pdf.generate'],
  field_agent: ['app.create', 'app.read.own', 'customer.search', 'pdf.generate'],
  branch_head: ['app.read.branch', 'app.approve', 'customer.search', 'pdf.generate', 'app.create'],
  operations: ['app.read.all', 'app.approve', 'dept.work', 'customer.search', 'pdf.generate', 'core.manual_open'],
  compliance: ['app.read.all', 'app.approve', 'dept.work', 'customer.search', 'pdf.generate', 'compliance.cases'],
  md: ['app.read.all', 'app.approve', 'pdf.generate'],
  auditor: ['app.read.all', 'audit.read', 'audit.export', 'audit.findings', 'dept.work', 'pdf.generate'],
  admin: ['admin.users', 'admin.catalog', 'admin.rules', 'admin.integrations', 'audit.read'],
  it: ['admin.integrations', 'it.devices', 'it.logs', 'it.retry', 'dept.work'],
  digital: ['dept.work'],
  cards: ['dept.work'],
  customer_service: ['customer.lookup_status', 'customer.search', 'dept.work'],
  risk: ['risk.config', 'app.read.all', 'dept.work'],
}
export function can(role: Role, p: Permission) { return ROLE_PERMISSIONS[role]?.includes(p) ?? false }

/** Department workspaces: queue (task types), allowed actions, SLA hours. Enforced server-side. */
export interface DeptDef { key: string; name: { fr: string; en: string; rn: string }; roles: Role[]; taskTypes: string[]; actions: Array<{ key: string; label: string; to: string; requires?: string[] }>; slaHours: number }
export const DEPARTMENTS: DeptDef[] = [
  { key: 'operations', name: { fr: 'Opérations / CASA', en: 'Operations / CASA', rn: 'Ibikorwa / CASA' }, roles: ['operations'], slaHours: 24,
    taskTypes: ['core_fallback', 'document_qa'],
    actions: [{ key: 'start', label: 'Start', to: 'in_progress' }, { key: 'manual_opened', label: 'Mark opened manually (enter CIF/account)', to: 'done', requires: ['cif', 'accountNumber'] }, { key: 'retry_core', label: 'Retry Flexcube', to: 'in_progress' }, { key: 'qa_pass', label: 'Documents OK', to: 'done' }, { key: 'qa_fail', label: 'Documents not OK', to: 'returned', requires: ['note'] }] },
  { key: 'compliance', name: { fr: 'Conformité', en: 'Compliance', rn: 'Ukwubahiriza amategeko' }, roles: ['compliance'], slaHours: 48,
    taskTypes: ['aml_hit', 'edd', 'kyc_refresh', 'str'],
    actions: [{ key: 'start', label: 'Open case', to: 'in_progress' }, { key: 'false_positive', label: 'Close: false positive', to: 'done', requires: ['note'] }, { key: 'confirm_match', label: 'Confirm match (block)', to: 'escalated', requires: ['note'] }, { key: 'edd_complete', label: 'EDD complete', to: 'done', requires: ['note'] }, { key: 'flag_str', label: 'Flag STR to FIU (CRF)', to: 'str_flagged', requires: ['note'] }, { key: 'kyc_refreshed', label: 'KYC refreshed', to: 'done' }] },
  { key: 'digital', name: { fr: 'Digital / E-banking', en: 'Digital / E-banking', rn: 'Digital / E-banking' }, roles: ['digital'], slaHours: 24,
    taskTypes: ['svc_pesaflash', 'svc_ecocash', 'svc_mobile_banking', 'svc_internet_banking', 'svc_finconnect', 'svc_estatement'],
    actions: [{ key: 'start', label: 'In progress', to: 'in_progress' }, { key: 'activated', label: 'Activated', to: 'done' }, { key: 'rejected', label: 'Rejected', to: 'rejected', requires: ['note'] }] },
  { key: 'cards', name: { fr: 'Cartes / Chèques', en: 'Cards / Cheques', rn: 'Amakarita / Amasheki' }, roles: ['cards'], slaHours: 72,
    taskTypes: ['svc_cheque_book', 'svc_transfer_booklet'],
    actions: [{ key: 'ordered', label: 'Ordered from printer', to: 'in_progress' }, { key: 'ready', label: 'Ready for collection', to: 'ready' }, { key: 'delivered', label: 'Delivered to customer', to: 'done' }] },
  { key: 'customer_service', name: { fr: 'Service clientèle', en: 'Customer service', rn: 'Ubufasha bw\'abakiriya' }, roles: ['customer_service'], slaHours: 24,
    taskTypes: ['referral_followup'],
    actions: [{ key: 'contacted', label: 'Customer contacted', to: 'done', requires: ['note'] }] },
  { key: 'risk', name: { fr: 'Risques', en: 'Risk', rn: 'Ingorane' }, roles: ['risk'], slaHours: 72,
    taskTypes: ['risk_review'],
    actions: [{ key: 'reviewed', label: 'Reviewed', to: 'done', requires: ['note'] }] },
  { key: 'it', name: { fr: 'Informatique', en: 'IT', rn: 'Ubuhinga' }, roles: ['it'], slaHours: 8,
    taskTypes: ['integration_error'],
    actions: [{ key: 'resolved', label: 'Resolved', to: 'done', requires: ['note'] }] },
  { key: 'audit', name: { fr: 'Audit interne', en: 'Internal audit', rn: 'Igenzura ry\'imbere' }, roles: ['auditor'], slaHours: 240,
    taskTypes: ['audit_sample', 'audit_finding'],
    actions: [{ key: 'sample_ok', label: 'Sample OK', to: 'done' }, { key: 'raise_finding', label: 'Raise finding', to: 'finding', requires: ['note'] }, { key: 'close_finding', label: 'Close finding', to: 'done', requires: ['note'] }] },
]
export function deptFor(role: Role) { return DEPARTMENTS.filter((d) => d.roles.includes(role)) }
export const SERVICE_TASKS: Record<string, { department: string; type: string; title: string }> = {
  pesaflash: { department: 'digital', type: 'svc_pesaflash', title: 'PesaFlash activation' },
  ecocash: { department: 'digital', type: 'svc_ecocash', title: 'Ecocash banking link' },
  mobileBanking: { department: 'digital', type: 'svc_mobile_banking', title: 'Mobile banking' },
  internetBanking: { department: 'digital', type: 'svc_internet_banking', title: 'Internet banking' },
  finconnect: { department: 'digital', type: 'svc_finconnect', title: 'FinConnect activation' },
  eStatement: { department: 'digital', type: 'svc_estatement', title: 'E-statement subscription' },
  chequeBook: { department: 'cards', type: 'svc_cheque_book', title: 'Cheque book' },
  transferOrderBooklet: { department: 'cards', type: 'svc_transfer_booklet', title: 'Transfer order booklet' },
}
