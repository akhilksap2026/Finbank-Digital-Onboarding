import { config } from '../config'
export interface AmlParty { id: string; name: string; dateOfBirth?: string; nationality?: string; idNumber?: string; declaredPep?: boolean }
export interface AmlResult { partyId: string; result: 'clear' | 'potential_match' | 'pep' | 'sanctioned' | 'error'; score: number; providerRef: string; details: Record<string, unknown> }
export interface AmlAdapter { name: string; screen(parties: AmlParty[]): Promise<AmlResult[]>; health(): Promise<boolean> }

/** Deterministic mock: names containing watch-list tokens produce hits, for demos and tests. */
const WATCH = [{ token: 'SANCTION', result: 'sanctioned' as const, score: 98 }, { token: 'MATCH', result: 'potential_match' as const, score: 72 }, { token: 'MINISTRE', result: 'pep' as const, score: 85 }]
export const mockAml: AmlAdapter = {
  name: 'mock-aml',
  async screen(parties) {
    return parties.map((p) => {
      const n = p.name.toUpperCase()
      const hit = WATCH.find((w) => n.includes(w.token))
      if (hit) return { partyId: p.id, result: hit.result, score: hit.score, providerRef: `MOCK-${Date.now()}-${p.id}`, details: { list: hit.result === 'sanctioned' ? 'UN Consolidated (mock)' : hit.result === 'pep' ? 'PEP database (mock)' : 'Fuzzy name match (mock)' } }
      if (p.declaredPep) return { partyId: p.id, result: 'pep', score: 80, providerRef: `MOCK-${p.id}`, details: { list: 'Self-declared PEP' } }
      return { partyId: p.id, result: 'clear', score: 0, providerRef: `MOCK-${p.id}`, details: {} }
    })
  },
  async health() { return true },
}
/** Generic REST adapter: POST {parties} -> {results}. Map to the bank's AML vendor contract when known. */
export const httpAml: AmlAdapter = {
  name: 'http-aml',
  async screen(parties) {
    const r = await fetch(`${config.aml.url}/screen`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.aml.apiKey}` }, body: JSON.stringify({ parties }), signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`AML HTTP ${r.status}`)
    return ((await r.json()) as { results: AmlResult[] }).results
  },
  async health() { try { return (await fetch(`${config.aml.url}/health`, { signal: AbortSignal.timeout(4000) })).ok } catch { return false } },
}
export const aml = (): AmlAdapter => (config.aml.mode === 'http' ? httpAml : mockAml)
