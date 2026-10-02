alter table public.document_uploads
  add column document_id uuid unique references public.documents(id) on delete set null;

alter table public.document_facts
  add column source_extracted_field_id uuid unique
    references public.document_extracted_fields(id) on delete set null;

create index document_uploads_document_idx
  on public.document_uploads(document_id)
  where document_id is not null;

create index document_facts_source_extracted_field_idx
  on public.document_facts(source_extracted_field_id)
  where source_extracted_field_id is not null;
