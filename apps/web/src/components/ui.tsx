import type { ReactNode } from 'react'
import { STATUS, L } from '../i18n'
export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{(title || actions) && <header className="card-h"><h3>{title}</h3><div>{actions}</div></header>}{children}</section>
}
export function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: ReactNode; hint?: string }) {
  return <label className={`field ${error ? 'has-err' : ''}`}><span className="lbl">{label}{required && <b className="req">*</b>}</span>{children}{hint && <small className="hint">{hint}</small>}{error && <small className="err">{error}</small>}</label>
}
export function Text({ value, onChange, ...p }: { value: string | undefined; onChange(v: string): void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...p} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
}
export function Select({ value, onChange, options, placeholder }: { value: string | undefined; onChange(v: string): void; options: Array<[string, string]>; placeholder?: string }) {
  return <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder ?? '—'}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
}
export function Check({ checked, onChange, label }: { checked: boolean | undefined; onChange(v: boolean): void; label: ReactNode }) {
  return <label className="check"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}
const TONE: Record<string, string> = { ACCOUNT_OPENED: 'green', REJECTED: 'red', RETURNED: 'red', FALLBACK_MANUAL: 'orange', DRAFT: 'grey', done: 'green', rejected: 'red', escalated: 'red', str_flagged: 'red', returned: 'red', open: 'orange', in_progress: 'navy', high: 'red', critical: 'red', medium: 'orange', low: 'green', hit: 'red', pep: 'orange', clear: 'green', sanctioned: 'red', ok: 'green', down: 'red', degraded: 'orange', active: 'green', locked: 'red', wipe_pending: 'red', wiped: 'grey' }
export function Badge({ v }: { v: string | null | undefined }) { if (!v) return <span className="muted">—</span>; return <span className={`badge ${TONE[v] ?? 'navy'}`}>{STATUS[v] ? L(STATUS[v]) : v.replace(/_/g, ' ')}</span> }
export function Table({ columns, rows, onRow, empty = '—' }: { columns: ReactNode[]; rows: ReactNode[][]; onRow?(i: number): void; empty?: string }) {
  return <div className="tbl-wrap"><table className="tbl"><thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>
    {rows.length === 0 && <tr><td colSpan={columns.length} className="muted center">{empty}</td></tr>}
    {rows.map((r, i) => <tr key={i} onClick={onRow ? () => onRow(i) : undefined} className={onRow ? 'click' : ''}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
  </tbody></table></div>
}
export function Kpi({ label, value, tone = 'navy' }: { label: string; value: ReactNode; tone?: string }) { return <div className={`kpi ${tone}`}><div className="kv">{value}</div><div className="kl">{label}</div></div> }
export function Bars({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return <Card title={title}><div className="bars">{items.length === 0 && <div className="muted">—</div>}{items.map((i) => <div key={i.label} className="bar-row"><span className="bl">{i.label}</span><span className="bt"><span style={{ width: `${(i.value / max) * 100}%` }} /></span><b>{i.value}</b></div>)}</div></Card>
}
export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
