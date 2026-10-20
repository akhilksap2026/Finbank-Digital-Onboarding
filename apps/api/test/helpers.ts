import request from 'supertest'
import { createApp } from '../src/app'
import { pool } from '../src/db/pool'
import { migrate } from '../src/db/migrate'
import { seedReference } from '../src/db/seed'
import { MOCK_PASSWORD } from '../src/services/auth'

export const app = createApp()
export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate(); await seedReference()
}
export async function login(username: string, deviceId?: string) {
  const r = await request(app).post('/api/auth/login').send({ username, password: MOCK_PASSWORD, deviceId })
  if (r.status !== 200) throw new Error(`login ${username} ${r.status}`)
  return r.body.token as string
}
export const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex')
export async function uploadAllRequired(token: string, id: string) {
  const a = await request(app).get(`/api/applications/${id}`).set('authorization', `Bearer ${token}`)
  for (const r of a.body.requiredDocuments) {
    const up = await request(app).post(`/api/applications/${id}/documents`).set('authorization', `Bearer ${token}`).field('docType', r.docType).field('partyId', r.partyId ?? '').attach('file', PNG, { filename: 'scan.png', contentType: 'image/png' })
    if (up.status !== 201) throw new Error(`upload ${up.status} ${JSON.stringify(up.body)}`)
  }
}
export { request, pool }
