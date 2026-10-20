import { assertProductionConfig, config } from './config'
import { createApp } from './app'
import { migrate } from './db/migrate'
import { kycRefreshJob } from './routes/misc'

assertProductionConfig()
await migrate()
createApp().listen(config.port, '0.0.0.0', () => console.log(`FinBank onboarding API on :${config.port} (auth=${config.authMode}, flexcube=${config.flexcube.mode}, aml=${config.aml.mode})`))
// daily KYC refresh job
setInterval(() => kycRefreshJob({ id: null, name: 'scheduler', role: 'system' }).catch((e) => console.error('kyc job', e)), 24 * 3600_000)
