import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config'

// Documents are encrypted at rest with AES-256-GCM. File layout: iv(12) | tag(16) | ciphertext
function key() { return Buffer.from(config.storageKey, 'hex') }
export function saveEncrypted(relPath: string, data: Buffer) {
  const full = path.join(config.storageDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(data), c.final()])
  fs.writeFileSync(full, Buffer.concat([iv, c.getAuthTag(), enc]), { mode: 0o600 })
}
export function readEncrypted(relPath: string): Buffer {
  const buf = fs.readFileSync(path.join(config.storageDir, relPath))
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()])
}
export const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')
