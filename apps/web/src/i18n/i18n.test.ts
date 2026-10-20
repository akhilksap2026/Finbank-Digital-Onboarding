import { describe, expect, it } from 'vitest'
import { T, STATUS } from './index'
describe('i18n', () => {
  it('every key has FR, EN and Kirundi', () => { for (const [k, v] of Object.entries({ ...T, ...STATUS })) for (const l of ['fr', 'en', 'rn'] as const) expect(v[l], `${k}.${l}`).toBeTruthy() })
})
