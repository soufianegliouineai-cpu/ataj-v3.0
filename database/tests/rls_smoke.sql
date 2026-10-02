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
end $$;

select set_config('lifeos.user_id','00000000-0000-0000-0000-000000000001',false);
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
end $$;

reset role;
select 'LifeOS provider-neutral RLS smoke tests passed' as result;
