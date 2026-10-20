import 'express-async-errors'
import express from 'express'
import helmet from 'helmet'
import fs from 'node:fs'
import path from 'node:path'
import { ZodError } from 'zod'
import { config } from './config'
import { requireAuth } from './services/auth'
import { HttpError } from './services/workflow'
import { applications } from './routes/applications'
import { admin, auditRoutes, auth, catalog, customers, it, sync, workspaces } from './routes/misc'
import { dashboard } from './routes/dashboard'
import { pool } from './db/pool'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], workerSrc: ["'self'", 'blob:'], frameSrc: ["'self'", 'blob:'], objectSrc: ["'self'", 'blob:'] } }, crossOriginEmbedderPolicy: false }))
  app.use(express.json({ limit: '2mb' }))
  // naive per-IP login throttling
  const hits = new Map<string, { n: number; t: number }>()
  app.use('/api/auth/login', (req, res, next) => { const k = req.ip ?? 'x'; const h = hits.get(k) ?? { n: 0, t: Date.now() }; if (Date.now() - h.t > 60_000) { h.n = 0; h.t = Date.now() } h.n++; hits.set(k, h); if (h.n > Number(process.env.LOGIN_RATE_LIMIT || 20)) return res.status(429).json({ error: 'too_many_attempts' }); next() })
  app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }) } catch { res.status(503).json({ ok: false }) } })
  app.use('/api/auth', auth)
  app.use('/api', requireAuth)
  app.use('/api/catalog', catalog)
  app.use('/api/applications', applications)
  app.use('/api/customers', customers)
  app.use('/api/sync', sync)
  app.use('/api/workspaces', workspaces)
  app.use('/api/dashboard', dashboard)
  app.use('/api/audit', auditRoutes)
  app.use('/api/admin', admin)
  app.use('/api/it', it)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('cache-control', 'no-cache') } }))
    app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')))
  }
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, issues: err.issues })
    if (err instanceof ZodError) return res.status(422).json({ error: 'invalid_request', issues: err.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })) })
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' })
    console.error(err)
    pool.query('INSERT INTO error_log(source,message,detail) VALUES($1,$2,$3)', ['api', String(err?.message ?? err), { stack: String(err?.stack ?? '').slice(0, 2000) }]).catch(() => {})
    res.status(500).json({ error: 'internal_error' })
  })
  return app
}
