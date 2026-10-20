// Captures key screens with the system Chrome. Usage: BASE=http://localhost:8080 node scripts/screenshots.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true })
const PW = 'Finbank@2026'
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const apiTok = async (u) => (await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: PW }) })).json()).token
const apiGet = async (tok, p) => (await fetch(`${BASE}/api${p}`, { headers: { authorization: `Bearer ${tok}` } })).json()
let n = 0
async function shot(page, name, full = true) { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full }); console.log('shot', name) }
async function session(user, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-FR' })
  const page = await ctx.newPage()
  await page.goto(BASE); await page.fill('input[autocomplete=username]', user); await page.fill('input[type=password]', PW); await page.click('button.primary')
  await page.waitForSelector('.pinpad')
  for (let r = 0; r < 2; r++) for (const d of '135790') await page.click(`.pinpad button:text-is("${d}")`)
  await page.waitForSelector('nav.side'); await page.waitForTimeout(700)
  return { ctx, page }
}
// client-side navigation: a full reload re-locks the app (the encryption key lives only in memory)
const go = async (page, path, wait = 'main .card, main .kpis') => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path); await page.waitForSelector('nav.side'); await page.waitForSelector(wait).catch(() => {}); await page.waitForTimeout(600) }

// 1. login + PIN
{ const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); await p.goto(BASE); await p.waitForSelector('form.box'); await shot(p, 'login'); await p.fill('input[autocomplete=username]', 'clerk1'); await p.fill('input[type=password]', PW); await p.click('button.primary'); await p.waitForSelector('.pinpad'); for (const d of '135') await p.click(`.pinpad button:text-is("${d}")`); await shot(p, 'pin-setup'); await ctx.close() }

// 2. dashboards per role
for (const u of ['clerk1', 'agent1', 'bh1', 'ops1', 'comp1', 'md1', 'audit1', 'admin1', 'it1', 'digital1', 'cards1', 'cs1', 'risk1']) { const { ctx, page } = await session(u); await go(page, '/'); await shot(page, `dashboard-${u.replace(/\d$/, '')}`); await ctx.close() }

// 3. journey (clerk): new application start + steps on the seeded draft
{
  const { ctx, page } = await session('clerk1')
  await go(page, '/journey/new', '.stepper'); await page.fill('main .card:nth-of-type(2) input >> nth=0', 'Ndayishimiye'); await page.click('text=Rechercher'); await page.waitForTimeout(800); await shot(page, 'journey-01-customer-search')
  const tok = await apiTok('clerk1'); const draft = (await apiGet(tok, '/applications?status=DRAFT,RETURNED'))[0]
  await go(page, `/journey/${draft.id}`, '.stepper')
  const steps = await page.$$eval('.step', (els) => els.map((e) => e.textContent))
  for (let i = 1; i < steps.length; i++) { await page.click(`.step >> nth=${i}`); await page.waitForTimeout(500); await shot(page, `journey-${String(i + 1).padStart(2, '0')}-${steps[i].replace(/^\d+/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]+/g, '-').toLowerCase().replace(/-+$/, '')}`) }
  // tablet portrait
  await page.setViewportSize({ width: 820, height: 1180 }); await page.click('.step >> nth=3'); await shot(page, 'journey-tablet-portrait-parties', false)
  await ctx.close()
}
// 4. approvals: branch head queue + detail, MD exceptional, ops fallback
{
  const { ctx, page } = await session('bh1'); await go(page, '/approvals'); await shot(page, 'approval-branch-head-queue')
  const tok = await apiTok('bh1'); const a = (await apiGet(tok, '/applications?pendingFor=me'))[0]; await go(page, `/applications/${a.id}`); await shot(page, 'approval-branch-head-detail'); await ctx.close()
}
{ const { ctx, page } = await session('md1'); const tok = await apiTok('md1'); const a = (await apiGet(tok, '/applications?status=PENDING_MD'))[0]; if (a) { await go(page, `/applications/${a.id}`); await shot(page, 'approval-md-exceptional') } await ctx.close() }
{ const { ctx, page } = await session('comp1'); const tok = await apiTok('comp1'); const a = (await apiGet(tok, '/applications?status=PENDING_COMPLIANCE'))[0]; if (a) { await go(page, `/applications/${a.id}`); await shot(page, 'approval-compliance-pep') } await ctx.close() }
{ const { ctx, page } = await session('ops1'); const tok = await apiTok('ops1'); const a = (await apiGet(tok, '/applications?status=FALLBACK_MANUAL'))[0]; if (a) { await go(page, `/applications/${a.id}`); await shot(page, 'flexcube-fallback-manual-open') } await ctx.close() }

// 5. department workspaces
for (const [u, d] of [['ops1', 'operations'], ['comp1', 'compliance'], ['digital1', 'digital'], ['cards1', 'cards'], ['cs1', 'customer_service'], ['risk1', 'risk'], ['it1', 'it'], ['audit1', 'audit']]) {
  const { ctx, page } = await session(u)
  if (d === 'audit') { await go(page, '/workspace/audit'); await page.click('text=Tirer un échantillon'); await page.waitForTimeout(800) } else await go(page, `/workspace/${d}`)
  const row = await page.$('main .tbl tr.click'); if (row) { await row.click(); await page.waitForTimeout(500) }
  await shot(page, `workspace-${d}`); await ctx.close()
}
// 6. admin, IT, audit trail, risk, customer lookup
{ const { ctx, page } = await session('admin1'); await go(page, '/admin'); await shot(page, 'admin-users'); for (const [t, nm] of [['Produits', 'products'], ['Documents requis', 'documents'], ["Règles d'approbation", 'routing-rules'], ['Intégrations', 'integrations']]) { await page.click(`.chip:text-is("${t}")`); await page.waitForTimeout(500); await shot(page, `admin-${nm}`) } await ctx.close() }
{ const { ctx, page } = await session('it1'); await go(page, '/it'); await shot(page, 'it-devices-integrations'); await ctx.close() }
{ const { ctx, page } = await session('audit1'); await go(page, '/audit'); await shot(page, 'audit-trail', false); await ctx.close() }
{ const { ctx, page } = await session('risk1'); await go(page, '/risk'); await shot(page, 'risk-config'); await ctx.close() }
{ const { ctx, page } = await session('cs1'); const tok = await apiTok('cs1'); const ref = (await apiGet(tok, '/customers/search?q=a')).applications.find((x) => x.status === 'ACCOUNT_OPENED')?.ref; await go(page, '/lookup'); if (ref) { await page.fill('main input >> nth=0', ref); await page.click('main button.primary'); await page.waitForTimeout(700) } await shot(page, 'customer-service-lookup'); await ctx.close() }
// 7. language switch (Kirundi) + offline banner
{ const { ctx, page } = await session('clerk1'); await page.selectOption('.top select', 'rn'); await go(page, '/'); await shot(page, 'dashboard-clerk-kirundi', false); await ctx.setOffline(true); await page.evaluate(() => dispatchEvent(new Event('offline'))); await page.waitForTimeout(400); await shot(page, 'offline-mode', false); await ctx.close() }
await browser.close()
