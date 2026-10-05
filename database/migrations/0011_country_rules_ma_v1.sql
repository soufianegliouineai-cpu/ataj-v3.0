create table public.official_sources (
  id uuid primary key,
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  source_code text not null unique check (char_length(source_code) between 3 and 120),
  authority text not null,
  title text not null,
  legal_reference text,
  source_type text not null check (source_type in ('official_regulation','official_service_guidance')),
  source_url text not null,
  language text not null default 'fr' check (language in ('ar','fr','en')),
  evidence_locator jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','superseded','unavailable')),
  verified_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.country_rule_versions (
  id uuid primary key,
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  rule_code text not null check (char_length(rule_code) between 3 and 120),
  version integer not null check (version > 0),
  title text not null,
  document_type text not null,
  rule_type text not null check (rule_type in ('validity_period','application_requirement','renewal_requirement')),
  source_id uuid not null references public.official_sources(id) on delete restrict,
  rule_json jsonb not null,
  automatic_deadline boolean not null default false,
  status text not null check (status in ('draft','active','superseded')),
  effective_from date,
  effective_to date,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (jurisdiction, rule_code, version),
  check (status <> 'active' or activated_at is not null),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create unique index country_rule_versions_one_active_idx
  on public.country_rule_versions(jurisdiction, rule_code)
  where status='active';

create index country_rule_versions_pack_idx
  on public.country_rule_versions(jurisdiction, status, document_type, rule_type);

alter table public.official_sources enable row level security;
alter table public.country_rule_versions enable row level security;

create policy official_sources_public_read
on public.official_sources for select
using (status='active');

create policy country_rule_versions_public_read
on public.country_rule_versions for select
using (status='active');

grant select on public.official_sources to lifeos_app;
grant select on public.country_rule_versions to lifeos_app;
grant select on public.official_sources to lifeos_worker;
grant select on public.country_rule_versions to lifeos_worker;

insert into public.official_sources(
  id,jurisdiction,source_code,authority,title,legal_reference,source_type,source_url,language,evidence_locator,status,verified_on
) values
(
  '81000000-0000-4000-8000-000000000001',
  'MA',
  'MA_PASSPORT_DECREE_2_08_310',
  'Royaume du Maroc — Passeport.ma',
  'Décret instituant le passeport biométrique',
  'Décret n° 2-08-310 du 23 chaoual 1429 (23 octobre 2008)',
  'official_regulation',
  'https://www.passeport.ma/PDF/passeport12/fran%C3%A7ais/Passeport_d%C3%A9cret.pdf',
  'fr',
  '{"article":6,"verifiedFact":"biometric passport maximum validity is 5 years; under age 3 maximum validity is 3 years; validity is non-extendable"}'::jsonb,
  'active',
  '2026-10-05'
),
(
  '81000000-0000-4000-8000-000000000002',
  'MA',
  'MA_CNIE_DECREE_2_20_521',
  'Royaume du Maroc — Passeport.ma / réglementation CNIE',
  'Décret d’application de la loi relative à la CNIE',
  'Décret n° 2.20.521 du 22 Dhou al hijja 1441 (12 août 2020)',
  'official_regulation',
  'https://www.passeport.ma/PDF/CNIE/fran%C3%A7ais/CNIE_d%C3%A9cret.pdf',
  'fr',
  '{"article":1,"verifiedFact":"CNIE validity is 10 years for persons over age 12; for persons under 12, at most 7 years and not beyond the day before the 12th birthday"}'::jsonb,
  'active',
  '2026-10-05'
),
(
  '81000000-0000-4000-8000-000000000003',
  'MA',
  'MA_PASSPORT_DELIVERY_CONDITIONS',
  'Royaume du Maroc — Passeport.ma',
  'Conditions de délivrance du passeport biométrique au Maroc',
  null,
  'official_service_guidance',
  'https://www.passeport.ma/ConditionsDelivrance/DelAuMaroc',
  'fr',
  '{"section":"Conditions de délivrance du passeport biométrique","verifiedFact":"for adults and minors aged 12 to 18, the biometric passport is established on the basis of a valid CNIE"}'::jsonb,
  'active',
  '2026-10-05'
);

insert into public.country_rule_versions(
  id,jurisdiction,rule_code,version,title,document_type,rule_type,source_id,rule_json,automatic_deadline,status,effective_from,activated_at
) values
(
  '82000000-0000-4000-8000-000000000001',
  'MA',
  'passport_biometric_validity',
  1,
  'Moroccan biometric passport validity',
  'passport',
  'validity_period',
  '81000000-0000-4000-8000-000000000001',
  '{"kind":"validity_period","default":{"maxYears":5},"ageExceptions":[{"ageYearsLt":3,"maxYears":3}],"nonExtendable":true,"deadlineDerivation":"use_document_expiry_fact","legalDeadlineFromRule":false}'::jsonb,
  false,
  'active',
  '2008-10-23',
  now()
),
(
  '82000000-0000-4000-8000-000000000002',
  'MA',
  'cnie_validity',
  1,
  'Moroccan electronic national identity card validity',
  'identity_card',
  'validity_period',
  '81000000-0000-4000-8000-000000000002',
  '{"kind":"validity_period","ageBands":[{"ageYearsGte":12,"years":10},{"ageYearsLt":12,"maxYears":7,"mustExpireBeforeAgeYears":12}],"deadlineDerivation":"use_document_expiry_fact","legalDeadlineFromRule":false}'::jsonb,
  false,
  'active',
  '2020-08-12',
  now()
),
(
  '82000000-0000-4000-8000-000000000003',
  'MA',
  'passport_requires_valid_cnie_12_plus',
  1,
  'Valid CNIE required for Moroccan biometric passport applicants aged 12 and over',
  'passport',
  'application_requirement',
  '81000000-0000-4000-8000-000000000003',
  '{"kind":"application_requirement","appliesWhen":{"ageYearsGte":12},"requires":[{"documentType":"identity_card","state":"valid"}],"automaticTask":false,"automaticDeadline":false}'::jsonb,
  false,
  'active',
  null,
  now()
);
