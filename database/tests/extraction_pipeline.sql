\set ON_ERROR_STOP on

set role lifeos_app;
select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);

do $$
begin
  begin
    update public.document_processing_jobs
    set status='succeeded', result_json='{"fields":1}'::jsonb
    where id='91000000-0000-0000-0000-000000000001';
    raise exception 'queued job skipped running state';
  exception when check_violation then
    null;
  end;
end $$;

update public.document_processing_jobs
set status='running'
where id='91000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.document_processing_jobs
    where id='91000000-0000-0000-0000-000000000001'
      and status='running'
      and attempt_count=1
      and started_at is not null
  ) then
    raise exception 'running transition did not set lifecycle metadata';
  end if;
end $$;

do $$
begin
  begin
    update public.document_processing_jobs
    set status='succeeded'
    where id='91000000-0000-0000-0000-000000000001';
    raise exception 'succeeded job accepted without result_json';
  exception when check_violation then
    null;
  end;
end $$;

update public.document_processing_jobs
set status='succeeded', result_json='{"fields":1,"engine":"ci-contract"}'::jsonb
where id='91000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    update public.document_processing_jobs
    set status='running'
    where id='91000000-0000-0000-0000-000000000001';
    raise exception 'succeeded processing job was not terminal';
  exception when check_violation then
    null;
  end;
end $$;

do $$
begin
  begin
    insert into public.document_extraction_candidates(
      processing_job_id,upload_id,household_id,owner_user_id,
      field_key,value_json,normalized_value,confidence,provenance
    ) values (
      '91000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'expiry_date',
      '"2027-06-12"'::jsonb,
      '2027-06-12',
      0.998,
      '{"label":"Date of expiry"}'::jsonb
    );
    raise exception 'candidate without page provenance was accepted';
  exception when check_violation then
    null;
  end;
end $$;

insert into public.document_extraction_candidates(
  id,processing_job_id,upload_id,household_id,owner_user_id,
  field_key,value_json,normalized_value,confidence,provenance
) values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'expiry_date',
  '"2027-06-12"'::jsonb,
  '2027-06-12',
  0.998,
  '{"page":1,"label":"Date of expiry","boundingBox":[0.61,0.72,0.91,0.79]}'::jsonb
);

do $$
begin
  if not exists (
    select 1
    from public.document_extraction_candidates
    where id='92000000-0000-0000-0000-000000000001'
      and origin='ai_extracted'
      and review_status='pending'
      and provenance->>'page'='1'
  ) then
    raise exception 'valid extraction candidate was not persisted with provenance';
  end if;
end $$;

update public.document_extraction_candidates
set review_status='confirmed', reviewed_at=now()
where id='92000000-0000-0000-0000-000000000001';

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.document_extraction_candidates) <> 0 then
    raise exception 'extraction candidates leaked to household member';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000003',false);

do $$
begin
  if (select count(*) from public.document_extraction_candidates) <> 0 then
    raise exception 'extraction candidates leaked to outsider';
  end if;
end $$;

reset role;
select 'LifeOS extraction provenance gate tests passed' as result;
