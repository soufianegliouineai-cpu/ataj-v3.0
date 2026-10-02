\set ON_ERROR_STOP on

set role lifeos_app;
select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);

update public.document_uploads
set status='processing'
where id='90000000-0000-0000-0000-000000000002';

update public.document_processing_jobs
set status='running', started_at=now(), attempt_count=1
where id='91000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    insert into public.document_extraction_runs(
      processing_job_id,upload_id,household_id,owner_user_id,provider,model_name,source_sha256
    ) values (
      '91000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'custom','ci-extractor',repeat('e',64)
    );
    raise exception 'mismatched source hash entered extraction';
  exception when check_violation then null;
  end;
end $$;

insert into public.document_extraction_runs(
  id,processing_job_id,upload_id,household_id,owner_user_id,provider,model_name,model_version,
  status,source_sha256,page_count
) values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'custom','ci-extractor','1.0','running',repeat('d',64),1
);

insert into public.document_extracted_fields(
  extraction_run_id,field_key,value_json,normalized_value,confidence,page_number,bounding_box,source_text_hash
) values (
  '92000000-0000-0000-0000-000000000001',
  'expiry_date','"2027-06-12"'::jsonb,'2027-06-12',0.9821,1,
  '{"x":0.61,"y":0.72,"width":0.22,"height":0.04}'::jsonb,
  repeat('f',64)
);

do $$
begin
  if (select review_status from public.document_extracted_fields
      where extraction_run_id='92000000-0000-0000-0000-000000000001'
        and field_key='expiry_date') <> 'pending' then
    raise exception 'AI extracted consequential field bypassed confirmation';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000002',false);
do $$
begin
  if (select count(*) from public.document_extraction_runs
      where id='92000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'extraction run leaked to another household member';
  end if;
  if (select count(*) from public.document_extracted_fields
      where extraction_run_id='92000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'extracted fields leaked to another household member';
  end if;
end $$;

reset role;
select 'LifeOS extraction provenance gate tests passed' as result;
