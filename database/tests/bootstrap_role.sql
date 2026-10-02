do $$
begin
  if not exists (select 1 from pg_roles where rolname='lifeos_app') then
    create role lifeos_app login password 'lifeos_ci_password' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public to lifeos_app;
grant usage on schema private to lifeos_app;

grant select, update on public.app_users to lifeos_app;
grant select, insert, update on public.households to lifeos_app;
grant select, insert, update, delete on public.household_members to lifeos_app;
grant select, insert, update on public.people to lifeos_app;
grant select, insert, update, delete on public.documents to lifeos_app;
grant select, insert, update, delete on public.document_shares to lifeos_app;
grant select, insert on public.document_facts to lifeos_app;
grant select, insert on public.obligations to lifeos_app;
grant select, insert on public.deadlines to lifeos_app;
grant select, insert, update on public.tasks to lifeos_app;
grant select, insert, update, delete on public.idempotency_records to lifeos_app;
grant select, insert on public.audit_logs to lifeos_app;
