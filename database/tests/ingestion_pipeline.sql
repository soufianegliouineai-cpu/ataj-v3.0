\set ON_ERROR_STOP on

set role lifeos_app;
select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);

insert into public.document_uploads(
  id,household_id,owner_user_id,document_type,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,object_key
) values (
  '90000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'passport',
  'pending.pdf',
  'application/pdf',
  2048,
  repeat('a',64),
  'test/pending/source.pdf'
);

do $$
begin
  begin
    insert into public.document_processing_jobs(
      upload_id,household_id,owner_user_id,processor
    ) values (
      '90000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'custom'
    );
    raise exception 'unverified upload entered processing';
  exception when check_violation then
    null;
  end;
end $$;

update public.document_uploads
set
  storage_provider='s3_compatible',
  status='quarantined',
  actual_size_bytes=2048,
  actual_sha256=repeat('b',64),
  uploaded_at=now()
where id='90000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    insert into public.document_processing_jobs(
      upload_id,household_id,owner_user_id,processor
    ) values (
      '90000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'custom'
    );
    raise exception 'malware-pending upload entered processing';
  exception when check_violation then
    null;
  end;
end $$;

update public.document_uploads
set status='rejected', malware_status='infected', scan_completed_at=now()
where id='90000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    insert into public.document_processing_jobs(
      upload_id,household_id,owner_user_id,processor
    ) values (
      '90000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'custom'
    );
    raise exception 'infected upload entered processing';
  exception when check_violation then
    null;
  end;
end $$;

insert into public.document_uploads(
  id,household_id,owner_user_id,document_type,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,object_key,
  storage_provider,status,malware_status,actual_size_bytes,actual_sha256,
  uploaded_at,scan_completed_at
) values (
  '90000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'passport',
  'clean.pdf',
  'application/pdf',
  4096,
  repeat('c',64),
  'test/clean/source.pdf',
  's3_compatible',
  'clean',
  'clean',
  4096,
  repeat('d',64),
  now(),
  now()
);

do $$
begin
  begin
    insert into public.document_processing_jobs(
      upload_id,household_id,owner_user_id,processor
    ) values (
      '90000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'unconfigured'
    );
    raise exception 'unconfigured processor accepted a clean upload';
  exception when check_violation then
    null;
  end;
end $$;

insert into public.document_processing_jobs(
  id,upload_id,household_id,owner_user_id,processor,status
) values (
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'custom',
  'queued'
);

do $$
begin
  if (select count(*) from public.document_processing_jobs
      where id='91000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'clean verified upload could not enter processing';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.document_processing_jobs
      where id='91000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'processing job leaked to household member';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000003',false);

do $$
begin
  if (select count(*) from public.document_processing_jobs) <> 0 then
    raise exception 'processing jobs leaked to outsider';
  end if;
end $$;

reset role;
select 'LifeOS ingestion processing gate tests passed' as result;
