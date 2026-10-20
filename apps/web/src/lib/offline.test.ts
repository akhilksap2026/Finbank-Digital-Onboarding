// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it, beforeAll } from 'vitest'
import { deriveKey, encryptJson, decryptJson } from './crypto'
import * as off from './offline'

describe('crypto', () => {
  it('round-trips and rejects a wrong PIN', async () => {
    const salt = new Uint8Array(16); const k = await deriveKey('123456', salt, 1000); const box = await encryptJson(k, { a: 1 })
    expect(await decryptJson(k, box)).toEqual({ a: 1 }); expect(atob(box.ct)).not.toContain('"a"')
    await expect(decryptJson(await deriveKey('654321', salt, 1000), box)).rejects.toThrow()
  })
})
describe('offline store', () => {
  beforeAll(async () => { await off.setPin('clerk1', '246810') })
  it('stores drafts encrypted and needs the PIN after lock', async () => {
    await off.saveDraft({ clientUuid: 'c1', kind: 'new_customer', customerType: 'individual', data: { secret: 'NDAYISHIMIYE' }, updatedAt: '' })
    expect((await off.getDraft('c1'))?.data.secret).toBe('NDAYISHIMIYE')
    off.lockKey(); await expect(off.getDraft('c1')).rejects.toThrow('locked')
    expect(await off.unlock('clerk1', '000000')).toBe(false); expect(await off.unlock('clerk1', '246810')).toBe(true)
  })
  it('collapses queued updates into the pending create', async () => {
    await off.enqueue({ opId: 'o1', type: 'create', clientUuid: 'c1', payload: { data: { v: 1 } }, at: '1' })
    await off.enqueue({ opId: 'o2', type: 'update', clientUuid: 'c1', payload: { data: { v: 2 } }, at: '2' })
    const q = await off.queue(); expect(q).toHaveLength(1); expect(q[0].type).toBe('create'); expect(q[0].payload.data.v).toBe(2)
  })
  it('remote wipe destroys everything', async () => {
    ;(globalThis as any).localStorage = { removeItem() {} }
    await off.wipeAll(); expect(await off.hasPin('clerk1')).toBe(false); expect(off.isUnlocked()).toBe(false)
  })
})
