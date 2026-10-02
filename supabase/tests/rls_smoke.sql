\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

insert into public.profiles(id,display_name) values ('00000000-0000-0000-0000-000000000001','Owner');
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

do $$
begin
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'owner cannot read own document';
  end if;
end $$;

reset role;
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

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.households where id='10000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'active household member cannot read household';
  end if;
  if (select count(*) from public.people where id='20000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'active household member cannot read people metadata';
  end if;
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'private document leaked to household member before explicit share';
  end if;
  if (select count(*) from public.document_facts where document_id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'document fact leaked before explicit share';
  end if;
  if (select count(*) from public.obligations where id='50000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'obligation leaked before explicit share';
  end if;
  if (select count(*) from public.deadlines where id='60000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'deadline leaked before explicit share';
  end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into public.document_shares(document_id,user_id,can_edit) values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  false
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);

do $$
begin
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'explicit document share did not grant read access';
  end if;
  if (select count(*) from public.document_facts where document_id='30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'facts did not inherit document read access';
  end if;
  if (select count(*) from public.obligations where id='50000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'obligation did not inherit document read access';
  end if;
  if (select count(*) from public.deadlines where id='60000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'deadline did not inherit document read access';
  end if;
end $$;

do $$
begin
  begin
    update public.documents
    set title='Unauthorized Edit'
    where id='30000000-0000-0000-0000-000000000001';
    if found then
      raise exception 'read-only recipient edited document';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update public.document_shares
set can_edit=true
where document_id='30000000-0000-0000-0000-000000000001'
  and user_id='00000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
update public.documents
set title='Shared Passport'
where id='30000000-0000-0000-0000-000000000001';

do $$
begin
  if (select title from public.documents where id='30000000-0000-0000-0000-000000000001') <> 'Shared Passport' then
    raise exception 'edit-enabled share could not edit allowed document fields';
  end if;
end $$;

insert into public.tasks(
  id,household_id,created_by,assigned_to_user_id,title,status,due_at
) values (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Prepare passport renewal',
  'ready',
  '2027-03-14'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update public.tasks
set status='in_progress'
where id='70000000-0000-0000-0000-000000000001';

do $$
begin
  if (select status from public.tasks where id='70000000-0000-0000-0000-000000000001') <> 'in_progress' then
    raise exception 'task assignee could not update task status';
  end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);

do $$
begin
  if (select count(*) from public.households where id='10000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'non-member can read household';
  end if;
  if (select count(*) from public.people where id='20000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'non-member can read people metadata';
  end if;
  if (select count(*) from public.documents where id='30000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'non-member can read document';
  end if;
  if (select count(*) from public.tasks where id='70000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'unrelated user can read task';
  end if;
end $$;

reset role;
select 'LifeOS RLS smoke tests passed' as result;
