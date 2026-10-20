import { api, deviceId } from './api'
import { dequeue, getDraft, queue, saveDraft, wipeAll } from './offline'

export type SyncResult = { sent: number; failed: number; command: string | null }
export async function getGps(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (!('geolocation' in navigator)) return null
  return new Promise((res) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => res(null), { timeout: 8000, maximumAge: 60000 }))
}
let running = false
export async function syncNow(onCommand: (c: string) => void): Promise<SyncResult> {
  if (running || !navigator.onLine) return { sent: 0, failed: 0, command: null }
  running = true
  try {
    const ops = await queue()
    const r = await api<{ command: string | null; results: any[] }>('/sync', { body: { deviceId: deviceId(), ops: ops.map(({ at, ...o }) => o), pendingItems: ops.length } })
    if (r.command === 'wipe') { await wipeAll(); onCommand('wipe'); return { sent: 0, failed: 0, command: 'wipe' } }
    if (r.command === 'lock') { onCommand('lock'); return { sent: 0, failed: 0, command: 'lock' } }
    let failed = 0
    for (const res of r.results) {
      const op = ops.find((o) => o.opId === res.opId)!
      if (res.ok) { await dequeue(op.opId); const d = await getDraft(op.clientUuid); if (d) await saveDraft({ ...d, serverId: res.id, ref: res.ref, version: res.version }) } else failed++
    }
    return { sent: r.results.length - failed, failed, command: null }
  } finally { running = false }
}
