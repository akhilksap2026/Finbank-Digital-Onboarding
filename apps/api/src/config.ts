import path from 'node:path'
const env = process.env
export const config = {
  port: Number(env.PORT || 8080),
  databaseUrl: env.DATABASE_URL || 'postgres://finbank:finbank@localhost:5432/finbank',
  jwtSecret: env.JWT_SECRET || 'dev-only-change-me',
  jwtTtl: env.JWT_TTL || '10h',
  authMode: (env.AUTH_MODE || 'mock') as 'mock' | 'ldap',
  ldap: {
    url: env.LDAP_URL || 'ldaps://ad.finbank.local:636',
    bindDn: env.LDAP_BIND_DN || '',
    bindPassword: env.LDAP_BIND_PASSWORD || '',
    baseDn: env.LDAP_BASE_DN || 'DC=finbank,DC=local',
    userFilter: env.LDAP_USER_FILTER || '(sAMAccountName={{username}})',
    // AD group CN -> app role mapping, e.g. "GG-DAO-Clerk=clerk,GG-DAO-BranchHead=branch_head"
    groupRoleMap: env.LDAP_GROUP_ROLE_MAP || '',
    tlsRejectUnauthorized: env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
  flexcube: {
    mode: (env.FLEXCUBE_MODE || 'mock') as 'mock' | 'soap',
    url: env.FLEXCUBE_GATEWAY_URL || 'http://fcubs.finbank.local:7001',
    source: env.FLEXCUBE_SOURCE || 'DAOAPP',
    ubscomp: env.FLEXCUBE_UBSCOMP || 'FCUBS',
    userId: env.FLEXCUBE_USER || 'DAOUSER',
    timeoutMs: Number(env.FLEXCUBE_TIMEOUT_MS || 20000),
    mockFailRate: Number(env.FLEXCUBE_MOCK_FAIL_RATE || 0),
  },
  aml: { mode: (env.AML_MODE || 'mock') as 'mock' | 'http', url: env.AML_URL || '', apiKey: env.AML_API_KEY || '' },
  storageDir: env.STORAGE_DIR || path.resolve('data/documents'),
  storageKey: env.STORAGE_ENCRYPTION_KEY || '0'.repeat(64), // 32-byte hex, AES-256-GCM at rest
  webDist: env.WEB_DIST || path.resolve('../web/dist'),
  retentionYears: Number(env.RETENTION_YEARS || 10),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 10),
}
export function assertProductionConfig() {
  if (process.env.NODE_ENV === 'production') {
    if (config.jwtSecret === 'dev-only-change-me') throw new Error('JWT_SECRET must be set in production')
    if (/^0+$/.test(config.storageKey)) throw new Error('STORAGE_ENCRYPTION_KEY must be set in production')
    if (config.authMode === 'mock') console.warn('[WARN] AUTH_MODE=mock in production — use ldap')
  }
}
