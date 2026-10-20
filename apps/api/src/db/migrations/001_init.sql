-- FinBank onboarding schema (PostgreSQL 15+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE branches (code TEXT PRIMARY KEY, name TEXT NOT NULL, province TEXT NOT NULL DEFAULT '');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  branch_code TEXT REFERENCES branches(code),
  staff_code TEXT UNIQUE,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  code TEXT PRIMARY KEY,
  names JSONB NOT NULL,                 -- {fr,en,rn}
  category TEXT NOT NULL,               -- current|savings|term_deposit
  customer_types TEXT[] NOT NULL,
  currencies TEXT[] NOT NULL,
  min_opening JSONB NOT NULL DEFAULT '{}',
  monthly_fee JSONB NOT NULL DEFAULT '{}',
  rules JSONB NOT NULL DEFAULT '{}',    -- requiresGuardian, minAge, maxAge, requiresEmployer...
  flexcube_account_class TEXT NOT NULL,
  form_type_label TEXT NOT NULL DEFAULT 'current',  -- which box to tick on the official form
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_requirements (
  id SERIAL PRIMARY KEY,
  customer_type TEXT NOT NULL,
  product_code TEXT REFERENCES products(code),   -- NULL = applies to all products of the type
  doc_type TEXT NOT NULL,
  per_party_role TEXT,                            -- e.g. signatory: one per signatory
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  labels JSONB NOT NULL
);

CREATE TABLE routing_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  condition JSONB NOT NULL,     -- {"any":[{"field":"pep","eq":true}, ...]}
  add_role TEXT NOT NULL,       -- operations|compliance|md
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cif TEXT UNIQUE,
  customer_type TEXT NOT NULL,
  full_name TEXT NOT NULL,
  id_number TEXT,
  nif TEXT,
  date_of_birth DATE,
  phone TEXT,
  branch_code TEXT,
  risk_rating TEXT,
  kyc_last_review DATE,
  kyc_next_review DATE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_name_idx ON customers (lower(full_name));
CREATE INDEX customers_id_idx ON customers (id_number);
CREATE INDEX customers_nif_idx ON customers (nif);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT UNIQUE NOT NULL,
  client_uuid UUID UNIQUE,                 -- offline idempotency key
  kind TEXT NOT NULL,
  customer_type TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  product_code TEXT REFERENCES products(code),
  branch_code TEXT NOT NULL REFERENCES branches(code),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  approval_chain TEXT[] NOT NULL DEFAULT '{}',
  chain_index INT NOT NULL DEFAULT 0,
  risk_score INT NOT NULL DEFAULT 0,
  risk_rating TEXT NOT NULL DEFAULT 'low',
  risk_factors JSONB NOT NULL DEFAULT '[]',
  aml_status TEXT NOT NULL DEFAULT 'not_run',
  data JSONB NOT NULL,
  applicant_name TEXT NOT NULL DEFAULT '',
  referral_source TEXT,
  referral_staff_code TEXT,
  capture_channel TEXT NOT NULL DEFAULT 'branch',  -- branch|field
  gps JSONB,
  device_id TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  cif TEXT,
  account_number TEXT,
  core_status TEXT NOT NULL DEFAULT 'not_sent', -- not_sent|created|failed|manual
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX applications_status_idx ON applications (status, branch_code);
CREATE INDEX applications_creator_idx ON applications (created_by);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id),
  doc_type TEXT NOT NULL,
  party_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  qa_status TEXT NOT NULL DEFAULT 'pending',   -- pending|accepted|rejected
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id),
  step_role TEXT NOT NULL,
  decision TEXT NOT NULL,   -- approve|return|reject
  comment TEXT NOT NULL DEFAULT '',
  actor_id UUID NOT NULL REFERENCES users(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aml_screenings (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id),
  party_id TEXT NOT NULL,
  party_name TEXT NOT NULL,
  result TEXT NOT NULL,          -- clear|potential_match|pep|sanctioned|error
  score INT NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Department work items: service requests, compliance cases, QA, fallbacks, STR, findings...
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  type TEXT NOT NULL,
  application_id UUID REFERENCES applications(id),
  branch_code TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  sla_due_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX tasks_dept_idx ON tasks (department, status);

CREATE TABLE integration_log (
  id SERIAL PRIMARY KEY,
  system TEXT NOT NULL,          -- flexcube|aml|ldap|sms
  operation TEXT NOT NULL,
  idempotency_key TEXT,
  application_id UUID REFERENCES applications(id),
  status TEXT NOT NULL,          -- success|error
  attempts INT NOT NULL DEFAULT 1,
  request JSONB,
  response JSONB,
  error TEXT,
  duration_ms INT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_idem_idx ON integration_log (system, operation, idempotency_key) WHERE status = 'success' AND idempotency_key IS NOT NULL;

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  branch_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active|locked|wipe_pending|wiped
  app_version TEXT,
  pending_items INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_gps JSONB,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE error_log (id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT NOT NULL, message TEXT NOT NULL, detail JSONB);

-- Immutable, hash-chained audit trail
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  branch_code TEXT,
  ip TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX audit_entity_idx ON audit_events (entity, entity_id);
CREATE INDEX audit_at_idx ON audit_events (at);

CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();
