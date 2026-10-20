export class ApiError extends Error { constructor(public status: number, public body: any) { super(body?.error || `HTTP ${status}`) } }
let token: string | null = null
export const setToken = (t: string | null) => { token = t }
export function deviceId(): string { let d = localStorage.getItem('fb.device'); if (!d) { d = `TAB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; localStorage.setItem('fb.device', d) } return d }
let onUnauthorized: () => void = () => {}
export const setOnUnauthorized = (f: () => void) => { onUnauthorized = f }
export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-device-id': deviceId() }
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const r = await fetch(`/api${path}`, { method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'), headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) })
  if (r.status === 401 && token) onUnauthorized()
  const ct = r.headers.get('content-type') || ''
  const body = ct.includes('json') ? await r.json() : await r.text()
  if (!r.ok) throw new ApiError(r.status, body)
  return body as T
}
export async function apiBlob(path: string): Promise<Blob> {
  const r = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${token}`, 'x-device-id': deviceId() } }); if (!r.ok) throw new ApiError(r.status, await r.text()); return r.blob()
}
