create table public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.document_uploads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  processor text not null check (processor in (
    'unconfigured','azure_document_intelligence','local_tesseract','custom'
  )),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 20),
  last_error_code text,
  last_error_message text,
  result_json jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_processing_jobs_owner_idx
  on public.document_processing_jobs(owner_user_id, created_at desc);

create index document_processing_jobs_status_idx
  on public.document_processing_jobs(status, queued_at)
  where status in ('queued','running');

create or replace function private.assert_upload_ready_for_processing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload_row record;
begin
  select
    u.household_id,
    u.owner_user_id,
    u.storage_provider,
    u.status,
    u.malware_status,
    u.actual_size_bytes,
    u.actual_sha256
  into upload_row
  from public.document_uploads u
  where u.id = new.upload_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'upload not found for processing';
  end if;

  if new.household_id <> upload_row.household_id
     or new.owner_user_id <> upload_row.owner_user_id then
    raise exception using
      errcode = '23514',
      message = 'processing job ownership must match upload';
  end if;

  if upload_row.storage_provider = 'unconfigured' then
    raise exception using
      errcode = '23514',
      message = 'upload storage provider is not configured';
  end if;

  if upload_row.status <> 'clean'
     or upload_row.malware_status <> 'clean'
     or upload_row.actual_size_bytes is null
     or upload_row.actual_sha256 is null then
    raise exception using
      errcode = '23514',
      message = 'upload is not clean and byte-verified for processing';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_upload_ready_for_processing() from public;

create trigger document_processing_jobs_require_clean_upload
before insert or update of upload_id, household_id, owner_user_id
on public.document_processing_jobs
for each row
execute function private.assert_upload_ready_for_processing();

alter table public.document_processing_jobs enable row level security;

create policy document_processing_jobs_owner_read
on public.document_processing_jobs for select
using (owner_user_id = private.current_user_id());

create policy document_processing_jobs_owner_insert
on public.document_processing_jobs for insert
with check (
  owner_user_id = private.current_user_id()
  and private.is_household_member(household_id)
  and exists (
    select 1
    from public.document_uploads u
    where u.id = upload_id
      and u.owner_user_id = private.current_user_id()
      and u.household_id = document_processing_jobs.household_id
  )
);

create policy document_processing_jobs_owner_update
on public.document_processing_jobs for update
using (owner_user_id = private.current_user_id())
with check (owner_user_id = private.current_user_id());

create policy document_processing_jobs_owner_delete
on public.document_processing_jobs for delete
using (
  owner_user_id = private.current_user_id()
  and status in ('queued','failed','cancelled')
);
