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
