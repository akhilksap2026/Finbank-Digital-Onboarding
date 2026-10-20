// AES-GCM encryption for data at rest on the tablet. Key derived from the user PIN (PBKDF2-SHA256, 310k iterations).
const enc = new TextEncoder(); const dec = new TextDecoder()
export const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)))
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export async function deriveKey(pin: string, salt: Uint8Array, iterations = 310_000): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptJson(key: CryptoKey, v: unknown): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(v)))
  return { iv: b64(iv), ct: b64(ct) }
}
export async function decryptJson<T>(key: CryptoKey, box: { iv: string; ct: string }): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))
  return JSON.parse(dec.decode(pt))
}
export function uuid(): string { return crypto.randomUUID() }
