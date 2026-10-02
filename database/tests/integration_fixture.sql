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
