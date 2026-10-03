do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lifeos_worker') then
    create role lifeos_worker nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public to lifeos_worker;
grant usage on schema private to lifeos_worker;

grant select, update on public.document_processing_jobs to lifeos_worker;
grant select, update on public.document_uploads to lifeos_worker;
grant select, insert, update on public.document_extraction_runs to lifeos_worker;
grant select, insert on public.document_extracted_fields to lifeos_worker;
grant insert on public.audit_logs to lifeos_worker;

create policy document_processing_jobs_worker_read
on public.document_processing_jobs for select
to lifeos_worker
using (true);

create policy document_processing_jobs_worker_update
on public.document_processing_jobs for update
to lifeos_worker
using (true)
with check (true);

create policy document_uploads_worker_read
on public.document_uploads for select
to lifeos_worker
using (true);

create policy document_uploads_worker_update
on public.document_uploads for update
to lifeos_worker
using (true)
with check (true);

create policy document_extraction_runs_worker_read
on public.document_extraction_runs for select
to lifeos_worker
using (true);

create policy document_extraction_runs_worker_insert
on public.document_extraction_runs for insert
to lifeos_worker
with check (true);

create policy document_extraction_runs_worker_update
on public.document_extraction_runs for update
to lifeos_worker
using (true)
with check (true);

create policy document_extracted_fields_worker_read
on public.document_extracted_fields for select
to lifeos_worker
using (true);

create policy document_extracted_fields_worker_insert
on public.document_extracted_fields for insert
to lifeos_worker
with check (true);

create policy audit_logs_worker_insert
on public.audit_logs for insert
to lifeos_worker
with check (true);
