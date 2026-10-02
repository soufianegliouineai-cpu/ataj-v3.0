create or replace function private.enforce_processing_job_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'queued' and new.status not in ('running','cancelled') then
    raise exception using errcode='23514', message='invalid processing transition from queued';
  elsif old.status = 'running' and new.status not in ('succeeded','failed','cancelled') then
    raise exception using errcode='23514', message='invalid processing transition from running';
  elsif old.status = 'failed' and new.status not in ('queued','cancelled') then
    raise exception using errcode='23514', message='invalid processing transition from failed';
  elsif old.status in ('succeeded','cancelled') then
    raise exception using errcode='23514', message='completed processing job is terminal';
  end if;

  if new.status = 'running' then
    new.started_at := coalesce(new.started_at, now());
    new.completed_at := null;
    new.attempt_count := old.attempt_count + 1;
    new.last_error_code := null;
    new.last_error_message := null;
  elsif new.status = 'succeeded' then
    if new.result_json is null then
      raise exception using errcode='23514', message='succeeded processing job requires result_json';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status in ('failed','cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'queued' then
    new.started_at := null;
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_processing_job_transition() from public;

create trigger document_processing_jobs_validate_transition
before update of status
on public.document_processing_jobs
for each row
execute function private.enforce_processing_job_transition();

create table public.document_extraction_candidates (
  id uuid primary key default gen_random_uuid(),
  processing_job_id uuid not null references public.document_processing_jobs(id) on delete cascade,
  upload_id uuid not null references public.document_uploads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  field_key text not null check (char_length(field_key) between 1 and 128),
  value_json jsonb not null,
  normalized_value text,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  origin text not null default 'ai_extracted' check (origin = 'ai_extracted'),
  review_status text not null default 'pending'
    check (review_status in ('pending','confirmed','corrected','rejected')),
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and provenance ? 'page'
    and (provenance->>'page') ~ '^[1-9][0-9]*$'
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index document_extraction_candidates_job_idx
  on public.document_extraction_candidates(processing_job_id, field_key);

create index document_extraction_candidates_owner_idx
  on public.document_extraction_candidates(owner_user_id, created_at desc);

create or replace function private.assert_extraction_candidate_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row record;
  upload_row record;
begin
  select
    j.upload_id,
    j.household_id,
    j.owner_user_id,
    j.status
  into job_row
  from public.document_processing_jobs j
  where j.id = new.processing_job_id;

  if not found then
    raise exception using errcode='23503', message='processing job not found for extraction candidate';
  end if;

  if job_row.status <> 'succeeded' then
    raise exception using errcode='23514', message='extraction candidate requires succeeded processing job';
  end if;

  if new.upload_id <> job_row.upload_id
     or new.household_id <> job_row.household_id
     or new.owner_user_id <> job_row.owner_user_id then
    raise exception using errcode='23514', message='extraction candidate ownership must match processing job';
  end if;

  select u.status, u.malware_status, u.actual_sha256
  into upload_row
  from public.document_uploads u
  where u.id = new.upload_id;

  if not found
     or upload_row.status <> 'clean'
     or upload_row.malware_status <> 'clean'
     or upload_row.actual_sha256 is null then
    raise exception using errcode='23514', message='extraction candidate requires clean verified upload';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_extraction_candidate_source() from public;

create trigger document_extraction_candidates_validate_source
before insert
on public.document_extraction_candidates
for each row
execute function private.assert_extraction_candidate_source();

alter table public.document_extraction_candidates enable row level security;

create policy document_extraction_candidates_owner_read
on public.document_extraction_candidates for select
using (owner_user_id = private.current_user_id());

create policy document_extraction_candidates_owner_insert
on public.document_extraction_candidates for insert
with check (
  owner_user_id = private.current_user_id()
  and private.is_household_member(household_id)
);

create policy document_extraction_candidates_owner_review
on public.document_extraction_candidates for update
using (owner_user_id = private.current_user_id())
with check (owner_user_id = private.current_user_id());
