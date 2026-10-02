alter table public.obligations
  add column source_fact_id uuid references public.document_facts(id) on delete set null;

create unique index obligations_source_fact_type_unique_idx
  on public.obligations(source_fact_id, obligation_type)
  where source_fact_id is not null;

create index obligations_source_fact_idx
  on public.obligations(source_fact_id)
  where source_fact_id is not null;
