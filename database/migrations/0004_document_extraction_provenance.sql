create table public.document_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  processing_job_id uuid not null unique references public.document_processing_jobs(id) on delete cascade,
  upload_id uuid not null unique references public.document_uploads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  provider text not null check (provider in ('azure_document_intelligence','local_tesseract','custom')),
  model_name text not null check (char_length(model_name) between 1 and 120),
  model_version text,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count between 1 and 1000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.document_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid not null references public.document_extraction_runs(id) on delete cascade,
  field_key text not null check (char_length(field_key) between 1 and 120),
  value_json jsonb not null,
  normalized_value text,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  page_number integer not null check (page_number between 1 and 1000),
  bounding_box jsonb,
  source_text_hash text check (source_text_hash is null or source_text_hash ~ '^[0-9a-f]{64}$'),
  review_status text not null default 'pending'
    check (review_status in ('pending','confirmed','corrected','rejected')),
  created_at timestamptz not null default now(),
  unique (extraction_run_id, field_key)
);

create index document_extraction_runs_owner_idx
  on public.document_extraction_runs(owner_user_id, created_at desc);

create index document_extracted_fields_run_idx
  on public.document_extracted_fields(extraction_run_id, field_key);

create or replace function private.assert_extraction_source_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row record;
  upload_row record;
begin
  select j.upload_id,j.household_id,j.owner_user_id,j.processor,j.status
  into job_row
  from public.document_processing_jobs j
  where j.id = new.processing_job_id;

  if not found then
    raise exception using errcode='23503', message='processing job not found';
  end if;

  select u.id,u.household_id,u.owner_user_id,u.status,u.malware_status,u.actual_sha256
  into upload_row
  from public.document_uploads u
  where u.id = new.upload_id;

  if not found then
    raise exception using errcode='23503', message='upload not found';
  end if;

  if job_row.upload_id <> new.upload_id
     or job_row.household_id <> new.household_id
     or job_row.owner_user_id <> new.owner_user_id
     or upload_row.household_id <> new.household_id
     or upload_row.owner_user_id <> new.owner_user_id then
    raise exception using errcode='23514', message='extraction ownership/source mismatch';
  end if;

  if job_row.status not in ('running','succeeded')
     or upload_row.status <> 'processing'
     or upload_row.malware_status <> 'clean'
     or upload_row.actual_sha256 is null
     or upload_row.actual_sha256 <> new.source_sha256 then
    raise exception using errcode='23514', message='extraction source is not processing and byte-verified';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_extraction_source_ready() from public;

create trigger document_extraction_runs_require_verified_source
before insert or update of processing_job_id,upload_id,household_id,owner_user_id,source_sha256
on public.document_extraction_runs
for each row execute function private.assert_extraction_source_ready();

alter table public.document_extraction_runs enable row level security;
alter table public.document_extracted_fields enable row level security;

create policy document_extraction_runs_owner_read
on public.document_extraction_runs for select
using (owner_user_id = private.current_user_id());

create policy document_extracted_fields_owner_read
on public.document_extracted_fields for select
using (
  exists (
    select 1 from public.document_extraction_runs r
    where r.id = extraction_run_id
      and r.owner_user_id = private.current_user_id()
  )
);


create policy document_extraction_runs_owner_insert
on public.document_extraction_runs for insert
with check (
  owner_user_id = private.current_user_id()
  and private.is_household_member(household_id)
);

create policy document_extraction_runs_owner_update
on public.document_extraction_runs for update
using (owner_user_id = private.current_user_id())
with check (owner_user_id = private.current_user_id());

create policy document_extracted_fields_owner_insert
on public.document_extracted_fields for insert
with check (
  exists (
    select 1
    from public.document_extraction_runs r
    where r.id = extraction_run_id
      and r.owner_user_id = private.current_user_id()
  )
);

create policy document_extracted_fields_owner_review
on public.document_extracted_fields for update
using (
  exists (
    select 1
    from public.document_extraction_runs r
    where r.id = extraction_run_id
      and r.owner_user_id = private.current_user_id()
  )
)
with check (
  exists (
    select 1
    from public.document_extraction_runs r
    where r.id = extraction_run_id
      and r.owner_user_id = private.current_user_id()
  )
);
