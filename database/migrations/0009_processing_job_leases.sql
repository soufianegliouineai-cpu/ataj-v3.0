alter table public.document_processing_jobs
  add column lease_owner uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column max_attempts integer not null default 3
    check (max_attempts between 1 and 20);

create index document_processing_jobs_claim_idx
  on public.document_processing_jobs(status, next_attempt_at, queued_at, id)
  where status='queued';

create index document_processing_jobs_stale_lease_idx
  on public.document_processing_jobs(lease_expires_at, id)
  where status='running';

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
    if new.lease_owner is null or new.lease_expires_at is null then
      raise exception using errcode='23514', message='running processing job requires a worker lease';
    end if;
    if new.lease_expires_at <= now() then
      raise exception using errcode='23514', message='processing worker lease must expire in the future';
    end if;
    if old.attempt_count >= old.max_attempts then
      raise exception using errcode='23514', message='processing job attempt limit exhausted';
    end if;
    new.started_at := now();
    new.completed_at := null;
    new.attempt_count := old.attempt_count + 1;
    new.last_error_code := null;
    new.last_error_message := null;
  elsif new.status = 'succeeded' then
    if new.result_json is null then
      raise exception using errcode='23514', message='succeeded processing job requires result_json';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    new.lease_owner := null;
    new.lease_expires_at := null;
  elsif new.status in ('failed','cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
    new.lease_owner := null;
    new.lease_expires_at := null;
  elsif new.status = 'queued' then
    new.started_at := null;
    new.completed_at := null;
    new.lease_owner := null;
    new.lease_expires_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_processing_job_transition() from public;
