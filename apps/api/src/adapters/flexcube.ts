import crypto from 'node:crypto'
import { config } from '../config'

/**
 * Oracle FLEXCUBE UBS 14.0 Gateway (SOAP/XML) adapter.
 * Services: FCUBSCustomerService/CreateCustomer (STDCIF) and FCUBSAccService/CreateCustAcc (STDCUSAC).
 * Body element names follow the documented FCUBS envelope (FCUBS_HEADER/FCUBS_BODY, *_IOPK_REQ). Field-level tags
 * MUST be validated against the bank's installed XSDs (see docs/OPEN_ITEMS.md).
 */
export interface CoreCustomerInput { msgId: string; branch: string; customerType: 'I' | 'C'; shortName: string; fullName: string; firstName?: string; lastName?: string; dateOfBirth?: string; nationality: string; idNumber?: string; nif?: string; address1: string; address2?: string; phone?: string; email?: string; category: string }
export interface CoreAccountInput { msgId: string; branch: string; cif: string; accountClass: string; currency: string; accountName: string; jointHolders?: string[] }
export interface CoreAdapter { name: string; createCustomer(i: CoreCustomerInput): Promise<{ cif: string; raw: string }>; createAccount(i: CoreAccountInput): Promise<{ accountNumber: string; raw: string }>; queryCustomer?(q: { idNumber?: string; nif?: string; name?: string }): Promise<any[]>; health(): Promise<boolean> }

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
function header(service: string, operation: string, msgId: string, branch: string) {
  return `<FCUBS_HEADER><SOURCE>${esc(config.flexcube.source)}</SOURCE><UBSCOMP>${esc(config.flexcube.ubscomp)}</UBSCOMP><MSGID>${esc(msgId)}</MSGID><CORRELID>${esc(msgId)}</CORRELID><USERID>${esc(config.flexcube.userId)}</USERID><BRANCH>${esc(branch)}</BRANCH><MODULEID>ST</MODULEID><SERVICE>${service}</SERVICE><OPERATION>${operation}</OPERATION></FCUBS_HEADER>`
}
export function buildCreateCustomerXml(i: CoreCustomerInput) {
  const personal = i.customerType === 'I' ? `<Custpersonal><FSTNAME>${esc(i.firstName)}</FSTNAME><LSTNAME>${esc(i.lastName)}</LSTNAME><DOB>${esc(i.dateOfBirth)}</DOB><MOBNUM>${esc(i.phone)}</MOBNUM><EMAILID>${esc(i.email)}</EMAILID></Custpersonal>` : `<Custcorp><CORPNAME>${esc(i.fullName)}</CORPNAME></Custcorp>`
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fcub="http://fcubs.ofss.com/service/FCUBSCustomerService"><soapenv:Body><fcub:CREATECUSTOMER_IOPK_REQ>${header('FCUBSCustomerService', 'CreateCustomer', i.msgId, i.branch)}<FCUBS_BODY><Customer-Full><CTYPE>${i.customerType}</CTYPE><NAME>${esc(i.fullName)}</NAME><SNAME>${esc(i.shortName)}</SNAME><LBRN>${esc(i.branch)}</LBRN><ADDRLN1>${esc(i.address1)}</ADDRLN1><ADDRLN2>${esc(i.address2)}</ADDRLN2><COUNTRY>BI</COUNTRY><NLTY>${esc(i.nationality)}</NLTY><CCATEG>${esc(i.category)}</CCATEG><UIDNAME>NATIONAL_ID</UIDNAME><UIDVAL>${esc(i.idNumber)}</UIDVAL><TAXID>${esc(i.nif)}</TAXID>${personal}</Customer-Full></FCUBS_BODY></fcub:CREATECUSTOMER_IOPK_REQ></soapenv:Body></soapenv:Envelope>`
}
export function buildCreateCustAccXml(i: CoreAccountInput) {
  const joint = (i.jointHolders ?? []).map((c) => `<Jointholders><JOINTHOLDER>${esc(c)}</JOINTHOLDER><JOINTHOLDERTYPE>JAF</JOINTHOLDERTYPE></Jointholders>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fcub="http://fcubs.ofss.com/service/FCUBSAccService"><soapenv:Body><fcub:CREATECUSTACC_IOPK_REQ>${header('FCUBSAccService', 'CreateCustAcc', i.msgId, i.branch)}<FCUBS_BODY><Cust-Account-IO><BRN>${esc(i.branch)}</BRN><CUSTNO>${esc(i.cif)}</CUSTNO><ACCLS>${esc(i.accountClass)}</ACCLS><CCY>${esc(i.currency)}</CCY><ADESC>${esc(i.accountName)}</ADESC>${joint}</Cust-Account-IO></FCUBS_BODY></fcub:CREATECUSTACC_IOPK_REQ></soapenv:Body></soapenv:Envelope>`
}
function parse(xml: string, tag: string) { return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] }

export const soapCore: CoreAdapter = {
  name: 'flexcube-soap',
  async createCustomer(i) {
    const xml = buildCreateCustomerXml(i)
    const r = await fetch(`${config.flexcube.url}/FCUBSCustomerService/FCUBSCustomerService`, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'CreateCustomer' }, body: xml, signal: AbortSignal.timeout(config.flexcube.timeoutMs) })
    const raw = await r.text()
    if (!r.ok || parse(raw, 'MSGSTAT') !== 'SUCCESS') throw new Error(`CreateCustomer failed: ${parse(raw, 'EDESC') ?? r.status}`)
    const cif = parse(raw, 'CUSTNO'); if (!cif) throw new Error('CreateCustomer: CUSTNO missing in response')
    return { cif, raw }
  },
  async createAccount(i) {
    const xml = buildCreateCustAccXml(i)
    const r = await fetch(`${config.flexcube.url}/FCUBSAccService/FCUBSAccService`, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'CreateCustAcc' }, body: xml, signal: AbortSignal.timeout(config.flexcube.timeoutMs) })
    const raw = await r.text()
    if (!r.ok || parse(raw, 'MSGSTAT') !== 'SUCCESS') throw new Error(`CreateCustAcc failed: ${parse(raw, 'EDESC') ?? r.status}`)
    const acc = parse(raw, 'ACC') ?? parse(raw, 'CUSTACNO'); if (!acc) throw new Error('CreateCustAcc: account number missing')
    return { accountNumber: acc, raw }
  },
  async health() { try { const r = await fetch(`${config.flexcube.url}/FCUBSCustomerService/FCUBSCustomerService?wsdl`, { signal: AbortSignal.timeout(4000) }); return r.ok } catch { return false } },
}

let mockDown = false
export function setMockCoreDown(v: boolean) { mockDown = v }
export const mockCore: CoreAdapter = {
  name: 'flexcube-mock',
  async createCustomer(i) {
    if (mockDown || i.fullName.toUpperCase().includes('COREFAIL') || Math.random() < config.flexcube.mockFailRate) throw new Error('Flexcube gateway timeout (mock)')
    const cif = String(parseInt(crypto.createHash('md5').update(i.msgId).digest('hex').slice(0, 8), 16) % 9000000 + 1000000).padStart(9, '0')
    return { cif, raw: buildCreateCustomerXml(i) }
  },
  async createAccount(i) {
    if (mockDown) throw new Error('Flexcube gateway timeout (mock)')
    const n = String(parseInt(crypto.createHash('md5').update(i.msgId).digest('hex').slice(0, 10), 16)).slice(0, 10).padStart(10, '0')
    return { accountNumber: `${i.branch}${n}`.slice(0, 14), raw: buildCreateCustAccXml(i) }
  },
  async health() { return !mockDown },
}
export const core = (): CoreAdapter => (config.flexcube.mode === 'soap' ? soapCore : mockCore)
