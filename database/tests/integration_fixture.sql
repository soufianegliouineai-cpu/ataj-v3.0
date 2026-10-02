insert into public.app_users(id,email,display_name) values
  ('00000000-0000-0000-0000-000000000011','integration-owner@example.test','Integration Owner'),
  ('00000000-0000-0000-0000-000000000012','integration-outsider@example.test','Integration Outsider')
on conflict (id) do nothing;

insert into public.households(id,name,created_by) values (
  '10000000-0000-0000-0000-000000000011',
  'Integration Household',
  '00000000-0000-0000-0000-000000000011'
)
on conflict (id) do nothing;

insert into public.household_members(household_id,user_id,role,status) values (
  '10000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000011',
  'owner',
  'active'
)
on conflict (household_id,user_id) do update set role=excluded.role,status=excluded.status;

insert into public.people(id,household_id,display_name,relationship,created_by) values (
  '20000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  'Integration Person',
  'self',
  '00000000-0000-0000-0000-000000000011'
)
on conflict (id) do nothing;


insert into public.app_users(id,email,display_name) values (
  '00000000-0000-4000-8000-000000000213',
  'review-owner@example.test',
  'Extraction Review Owner'
);

insert into public.households(id,name,created_by) values (
  '10000000-0000-4000-8000-000000000213',
  'Extraction Review Household',
  '00000000-0000-4000-8000-000000000213'
);

insert into public.household_members(household_id,user_id,role,status) values (
  '10000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000213',
  'owner',
  'active'
);

insert into public.people(id,household_id,display_name,relationship,created_by) values (
  '20000000-0000-4000-8000-000000000213',
  '10000000-0000-4000-8000-000000000213',
  'Extraction Review Person',
  'self',
  '00000000-0000-4000-8000-000000000213'
);

insert into public.document_uploads(
  id,household_id,owner_user_id,owner_person_id,document_type,
  original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
  object_key,storage_provider,status,malware_status,actual_size_bytes,actual_sha256,
  uploaded_at,scan_completed_at
) values (
  '30000000-0000-4000-8000-000000000213',
  '10000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000213',
  '20000000-0000-4000-8000-000000000213',
  'passport',
  'review-passport.pdf',
  'application/pdf',
  4096,
  repeat('1',64),
  'fixtures/review-passport/source.pdf',
  's3_compatible',
  'clean',
  'clean',
  4096,
  repeat('2',64),
  now(),
  now()
);

insert into public.document_processing_jobs(
  id,upload_id,household_id,owner_user_id,processor,status
) values (
  '40000000-0000-4000-8000-000000000213',
  '30000000-0000-4000-8000-000000000213',
  '10000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000213',
  'custom',
  'queued'
);

update public.document_uploads
set status='processing'
where id='30000000-0000-4000-8000-000000000213';

update public.document_processing_jobs
set status='running'
where id='40000000-0000-4000-8000-000000000213';

update public.document_processing_jobs
set status='succeeded', result_json='{"fixture":true,"fieldCount":1}'::jsonb
where id='40000000-0000-4000-8000-000000000213';

insert into public.document_extraction_runs(
  id,processing_job_id,upload_id,household_id,owner_user_id,
  provider,model_name,model_version,status,source_sha256,page_count,completed_at
) values (
  '50000000-0000-4000-8000-000000000213',
  '40000000-0000-4000-8000-000000000213',
  '30000000-0000-4000-8000-000000000213',
  '10000000-0000-4000-8000-000000000213',
  '00000000-0000-4000-8000-000000000213',
  'custom',
  'ci-fixture-extractor',
  '1.0',
  'succeeded',
  repeat('2',64),
  1,
  now()
);

insert into public.document_extracted_fields(
  id,extraction_run_id,field_key,value_json,normalized_value,
  confidence,page_number,bounding_box,source_text_hash,review_status
) values (
  '60000000-0000-4000-8000-000000000213',
  '50000000-0000-4000-8000-000000000213',
  'expiry_date',
  '"2029-12-31"'::jsonb,
  '2029-12-31',
  0.9821,
  1,
  '{"x":0.61,"y":0.72,"width":0.22,"height":0.04}'::jsonb,
  repeat('3',64),
  'pending'
);

update public.document_uploads
set status='processed'
where id='30000000-0000-4000-8000-000000000213';
