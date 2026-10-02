\set ON_ERROR_STOP on

insert into public.app_users(id,email,display_name) values
  ('00000000-0000-0000-0000-000000000001','owner@example.test','Owner'),
  ('00000000-0000-0000-0000-000000000002','member@example.test','Member'),
  ('00000000-0000-0000-0000-000000000003','outsider@example.test','Outsider');

insert into public.households(id,name,created_by) values (
  '10000000-0000-0000-0000-000000000001','LifeOS Household','00000000-0000-0000-0000-000000000001'
);
insert into public.household_members(household_id,user_id,role) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','adult');

insert into public.people(id,household_id,display_name,created_by) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Primary Person',
  '00000000-0000-0000-0000-000000000001'
);

set role lifeos_app;
select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);

insert into public.documents(
  id,household_id,owner_person_id,owner_user_id,document_type,title
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'passport',
  'Private Passport'
);

insert into public.document_facts(
  id,document_id,field_key,value_json,normalized_value,confidence,origin,review_status,provenance
) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'expiry_date',
  '"2027-06-12"'::jsonb,
  '2027-06-12',
  1,
  'user_confirmed',
  'confirmed',
  '{"source":"request_body"}'::jsonb
);

insert into public.obligations(
  id,household_id,source_document_id,obligation_type,title,status,confidence,rule_code,created_by
) values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'EXPIRY_PROTECTION',
  'Passport expiry protection',
  'protected',
  1,
  'generic_expiry_protection_v1',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.deadlines(
  id,household_id,obligation_id,due_at,recommended_action_at,severity,status,source
) values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '2027-06-12',
  '2027-03-14',
  'normal',
  'protected',
  'document.expiry_date'
);

insert into public.document_uploads(
  id,household_id,owner_user_id,owner_person_id,document_type,
  original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
  object_key,storage_provider,status,malware_status
) values (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'passport',
  'passport.pdf',
  'application/pdf',
  1024,
  repeat('a',64),
  'households/10000000-0000-0000-0000-000000000001/users/00000000-0000-0000-0000-000000000001/uploads/80000000-0000-0000-0000-000000000001/source.pdf',
  'unconfigured',
  'intent_created',
  'pending'
);

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.households where id='10000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'member cannot read household';
  end if;
  if (select count(*) from public.people where id='20000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'member cannot read people metadata';
  end if;
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'private document leaked before share';
  end if;
  if (select count(*) from public.document_facts where document_id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'private fact leaked before share';
  end if;
  if (select count(*) from public.document_uploads where id='80000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'private upload metadata leaked to household member';
  end if;
end $$;

insert into public.document_uploads(
  id,household_id,owner_user_id,document_type,original_filename,
  declared_mime_type,declared_size_bytes,object_key
) values (
  '80000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'other',
  'member.pdf',
  'application/pdf',
  512,
  'households/10000000-0000-0000-0000-000000000001/users/00000000-0000-0000-0000-000000000002/uploads/80000000-0000-0000-0000-000000000002/source.pdf'
);

do $$
begin
  if (select count(*) from public.document_uploads where id='80000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'household member cannot create or read own upload intent';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);

do $$
begin
  if (select count(*) from public.document_uploads) <> 1 then
    raise exception 'upload metadata leaked across household users';
  end if;
end $$;

insert into public.document_shares(document_id,user_id,can_edit) values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  false
);

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'share did not grant document read';
  end if;
  if (select count(*) from public.document_facts where document_id='30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'share did not grant fact read';
  end if;
  if (select count(*) from public.obligations where id='50000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'share did not grant obligation read';
  end if;
  if (select count(*) from public.deadlines where id='60000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'share did not grant deadline read';
  end if;
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000003',false);

do $$
begin
  if (select count(*) from public.households where id='10000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'outsider can read household';
  end if;
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'outsider can read document';
  end if;
  if (select count(*) from public.document_uploads) <> 0 then
    raise exception 'outsider can read upload metadata';
  end if;
end $$;

do $$
begin
  begin
    insert into public.document_uploads(
      household_id,owner_user_id,document_type,original_filename,
      declared_mime_type,declared_size_bytes,object_key
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      'other',
      'outsider.pdf',
      'application/pdf',
      100,
      'outsider/blocked/source.pdf'
    );
    raise exception 'outsider created upload intent in another household';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select 'LifeOS provider-neutral RLS smoke tests passed' as result;
