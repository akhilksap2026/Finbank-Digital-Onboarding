import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NAVY = '#0B2D63', ORANGE = '#F5821F', GREY = '#D9DDE3', LILAC = '#E4E1F0', INK = '#101828'
export const M = 32, W = 595.28, H = 841.89, CW = W - 2 * M
const here = path.dirname(fileURLToPath(import.meta.url))
const LOGO = [path.join(here, '../../assets/finbank-logo.png'), path.join(here, '../assets/finbank-logo.png'), path.resolve('assets/finbank-logo.png')].find((p) => fs.existsSync(p))

export type Doc = PDFKit.PDFDocument
export function newDoc(meta: { title: string; subject: string }) {
  return new PDFDocument({ size: 'A4', margin: M, autoFirstPage: false, info: { Title: meta.title, Subject: meta.subject, Author: 'FINBANK S.A.', Creator: 'FinBank Digital Account Opening' } })
}
export const v = (s: unknown) => (s === undefined || s === null ? '' : String(s))

export function logo(doc: Doc, x: number, y: number, h = 34) {
  if (LOGO) doc.image(LOGO, x, y, { height: h })
  else doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text('FinBank', x, y + 6)
}
/** Corporate-style header: navy logo block + orange band with title (as on the official scan). */
export function bandHeader(doc: Doc, title: string, style: 'orange' | 'grey' = 'orange', subtitle?: string) {
  doc.rect(M, M, 150, 62).fill(NAVY)
  doc.rect(M + 4, M + 6, 142, 40).fill('#FFFFFF')
  logo(doc, M + 10, M + 10, 32)
  doc.font('Helvetica-Oblique').fontSize(7).fillColor('#FFFFFF').text('More than a Bank, a Partner', M + 8, M + 50, { width: 140 })
  doc.rect(M + 150, M, CW - 150, 62).fill(style === 'orange' ? ORANGE : GREY)
  doc.font('Helvetica-Bold').fontSize(subtitle ? 14 : 15).fillColor(style === 'orange' ? NAVY : INK).text(title, M + 160, M + (subtitle ? 12 : 22), { width: CW - 170 })
  if (subtitle) doc.font('Helvetica-Oblique').fontSize(11).text(subtitle, M + 160, M + 34, { width: CW - 170 })
  return M + 72
}
export function smallHeader(doc: Doc, title: string, right?: string) {
  logo(doc, M, M, 30)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(title, M + 120, M + 8, { width: CW - 120, align: 'right' })
  if (right) doc.font('Helvetica').fontSize(8).fillColor(INK).text(right, M + 120, M + 26, { width: CW - 120, align: 'right' })
  doc.moveTo(M, M + 42).lineTo(W - M, M + 42).lineWidth(1.2).strokeColor(ORANGE).stroke()
  return M + 52
}
export function bar(doc: Doc, y: number, text: string, color = LILAC) {
  doc.rect(M, y, CW, 13).fill(color)
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text(text, M + 4, y + 3, { width: CW - 8, lineBreak: false, ellipsis: true })
  return y + 17
}
export function label(doc: Doc, x: number, y: number, t: string, w?: number, size = 7) {
  doc.font('Helvetica').fontSize(size).fillColor(INK).text(t, x, y, { width: w, lineBreak: !!w })
}
/** Label on the left, value box on the right. */
export function field(doc: Doc, x: number, y: number, w: number, lab: string, value: unknown, labW = Math.min(170, w * 0.45), h = 13) {
  label(doc, x, y + 3, lab, labW - 4, 6.8)
  doc.rect(x + labW, y, w - labW, h).lineWidth(0.6).strokeColor('#555').stroke()
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0B2D63').text(v(value), x + labW + 3, y + 3, { width: w - labW - 6, height: h - 2, lineBreak: false, ellipsis: true })
  return y + h + 4
}
export function boxes(doc: Doc, x: number, y: number, n: number, value: string, cell = 11) {
  for (let i = 0; i < n; i++) {
    doc.rect(x + i * cell, y, cell, 12).lineWidth(0.6).strokeColor('#555').stroke()
    const ch = value[i]; if (ch) doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text(ch, x + i * cell, y + 3, { width: cell, align: 'center' })
  }
  return x + n * cell
}
export function check(doc: Doc, x: number, y: number, lab: string, checked: boolean, w = 160) {
  doc.rect(x, y, 8, 8).lineWidth(0.6).strokeColor('#333').stroke()
  if (checked) { doc.font('ZapfDingbats').fontSize(7).fillColor(NAVY).text('4', x + 1, y + 1) }
  label(doc, x + 12, y + 1, lab, w - 12, 6.8)
  return x + w
}
export function table(doc: Doc, x: number, y: number, cols: Array<{ w: number; label: string }>, rows: string[][], rowH = 13, minRows = 0) {
  let cx = x
  const total = cols.reduce((s, c) => s + c.w, 0)
  doc.rect(x, y, total, rowH).lineWidth(0.6).strokeColor('#555').stroke()
  for (const c of cols) { label(doc, cx + 2, y + 3, c.label, c.w - 4, 6.3); doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke(); cx += c.w }
  const n = Math.max(rows.length, minRows)
  for (let r = 0; r < n; r++) {
    const ry = y + rowH * (r + 1); cx = x
    doc.rect(x, ry, total, rowH).stroke()
    cols.forEach((c, i) => {
      doc.moveTo(cx, ry).lineTo(cx, ry + rowH).stroke()
      const val = i === 0 && !rows[r] ? `${r + 1}.` : v(rows[r]?.[i])
      doc.font(rows[r] ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(rows[r] ? NAVY : INK).text(val, cx + 2, ry + 3, { width: c.w - 4, lineBreak: false, ellipsis: true })
      cx += c.w
    })
  }
  return y + rowH * (n + 1) + 4
}
export function sigBox(doc: Doc, x: number, y: number, w: number, h: number, lab: string, filled?: string) {
  doc.rect(x, y, w, h).lineWidth(0.6).strokeColor('#555').stroke()
  label(doc, x + 3, y + 2, lab, w - 6, 6.5)
  if (filled) doc.font('Helvetica-Oblique').fontSize(7).fillColor('#667').text(filled, x + 3, y + h - 11, { width: w - 6 })
  return y + h + 4
}
export function para(doc: Doc, x: number, y: number, w: number, text: string, size = 6.6, font = 'Helvetica') {
  doc.font(font).fontSize(size).fillColor(INK)
  const h = doc.heightOfString(text, { width: w, align: 'justify' })
  doc.text(text, x, y, { width: w, align: 'justify' })
  return y + h + 3
}
export function notRequested(doc: Doc) {
  const b = doc.page.margins.bottom; doc.page.margins.bottom = 0
  doc.save()
  doc.translate(W / 2, H / 2).rotate(-30)
  doc.opacity(0.85)
  doc.roundedRect(-210, -40, 420, 80, 10).lineWidth(4).strokeColor('#B42318').stroke()
  doc.font('Helvetica-Bold').fontSize(30).fillColor('#B42318').text('NOT REQUESTED', -210, -30, { width: 420, align: 'center', lineBreak: false })
  doc.fontSize(22).text('NON DEMANDÉ', -210, 6, { width: 420, align: 'center', lineBreak: false })
  doc.restore(); doc.opacity(1); doc.page.margins.bottom = b
}
export function footer(doc: Doc, ref: string, page: string) {
  const b = doc.page.margins.bottom; doc.page.margins.bottom = 0
  doc.font('Helvetica').fontSize(6).fillColor('#667').text(`FINBANK S.A. · 16, Boulevard de la Liberté, Bujumbura · 170 · www.finbank.co.bi   |   Réf. dossier ${ref}   |   ${page}`, M, H - M + 6, { width: CW, align: 'center', lineBreak: false })
  doc.page.margins.bottom = b
}
