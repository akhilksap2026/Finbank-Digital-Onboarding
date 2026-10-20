import { openDB, type IDBPDatabase } from 'idb'
import { decryptJson, deriveKey, encryptJson, unb64, b64 } from './crypto'

/** Encrypted local store: drafts + sync queue. Nothing readable is persisted without the PIN-derived key. */
export interface QueueOp { opId: string; type: 'create' | 'update'; clientUuid: string; payload: any; at: string }
export interface LocalDraft { clientUuid: string; serverId?: string; ref?: string; version?: number; kind: string; customerType: string; data: any; updatedAt: string; gps?: any }

let db: IDBPDatabase | null = null
let key: CryptoKey | null = null
async function open() { return (db ??= await openDB('finbank-onboarding', 1, { upgrade(d) { d.createObjectStore('meta'); d.createObjectStore('drafts'); d.createObjectStore('queue') } })) }

export async function hasPin(user: string) { return !!(await (await open()).get('meta', `pin:${user}`)) }
export async function setPin(user: string, pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16)); key = await deriveKey(pin, salt)
  const check = await encryptJson(key, { ok: user })
  await (await open()).put('meta', { salt: b64(salt), check }, `pin:${user}`)
}
export async function unlock(user: string, pin: string): Promise<boolean> {
  const m = await (await open()).get('meta', `pin:${user}`); if (!m) return false
  try { const k = await deriveKey(pin, unb64(m.salt)); const v = await decryptJson<any>(k, m.check); if (v.ok !== user) return false; key = k; return true } catch { return false }
}
export function lockKey() { key = null }
export const isUnlocked = () => !!key
function need() { if (!key) throw new Error('locked'); return key }

export async function saveDraft(d: LocalDraft) { await (await open()).put('drafts', await encryptJson(need(), d), d.clientUuid) }
export async function getDraft(id: string): Promise<LocalDraft | undefined> { const v = await (await open()).get('drafts', id); return v ? decryptJson(need(), v) : undefined }
export async function listDrafts(): Promise<LocalDraft[]> { const d = await open(); const out: LocalDraft[] = []; for (const v of await d.getAll('drafts')) { try { out.push(await decryptJson(need(), v)) } catch { /* other user */ } } return out }
export async function deleteDraft(id: string) { await (await open()).delete('drafts', id) }

export async function enqueue(op: QueueOp) {
  const d = await open()
  // collapse: one pending update per draft is enough (latest wins); a pending create absorbs later updates
  for (const k of await d.getAllKeys('queue')) {
    const o = await decryptJson<QueueOp>(need(), await d.get('queue', k))
    if (o.clientUuid === op.clientUuid) {
      if (o.type === 'create') { o.payload = { ...o.payload, data: op.payload.data, productCode: op.payload.productCode }; await d.put('queue', await encryptJson(need(), o), k); return }
      if (op.type === 'update') await d.delete('queue', k)
    }
  }
  await d.put('queue', await encryptJson(need(), op), op.opId)
}
export async function queue(): Promise<QueueOp[]> { const d = await open(); const out: QueueOp[] = []; for (const v of await d.getAll('queue')) { try { out.push(await decryptJson(need(), v)) } catch { /* skip */ } } return out.sort((a, b) => a.at.localeCompare(b.at)) }
export async function dequeue(opId: string) { await (await open()).delete('queue', opId) }
/** Remote wipe / logout-wipe: destroy every local record and key material. */
export async function wipeAll() { const d = await open(); await Promise.all([d.clear('drafts'), d.clear('queue'), d.clear('meta')]); key = null; localStorage.removeItem('fb.session') }
