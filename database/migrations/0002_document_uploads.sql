create table public.document_uploads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  owner_person_id uuid references public.people(id) on delete set null,
  document_type text not null check (document_type in (
    'passport','identity_card','driving_license','insurance','visa',
    'residence_permit','vehicle_registration','contract','invoice',
    'certificate','other'
  )),
  original_filename text not null check (
    char_length(original_filename) between 1 and 180
    and original_filename !~ '[\\/\x00]'
  ),
  declared_mime_type text not null check (declared_mime_type in (
    'application/pdf','image/jpeg','image/png','image/heic','image/webp'
  )),
  declared_size_bytes bigint not null check (
    declared_size_bytes > 0 and declared_size_bytes <= 26214400
  ),
  declared_sha256 text check (
    declared_sha256 is null or declared_sha256 ~ '^[0-9a-f]{64}$'
  ),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  storage_provider text not null default 'unconfigured'
    check (storage_provider in ('unconfigured','azure_blob','s3_compatible')),
  status text not null default 'intent_created'
    check (status in (
      'intent_created','uploading','quarantined','scanning','clean',
      'rejected','processing','processed','failed','expired'
    )),
  malware_status text not null default 'pending'
    check (malware_status in ('pending','clean','infected','error')),
  actual_size_bytes bigint check (actual_size_bytes is null or actual_size_bytes > 0),
  actual_sha256 text check (
    actual_sha256 is null or actual_sha256 ~ '^[0-9a-f]{64}$'
  ),
  storage_etag text,
  intent_expires_at timestamptz not null default (now() + interval '15 minutes'),
  uploaded_at timestamptz,
  scan_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_uploads_owner_idx
  on public.document_uploads(owner_user_id, created_at desc);

create index document_uploads_household_idx
  on public.document_uploads(household_id, created_at desc);

create index document_uploads_pending_idx
  on public.document_uploads(status, intent_expires_at)
  where status in ('intent_created','uploading','quarantined','scanning');

alter table public.document_uploads enable row level security;

create policy document_uploads_owner_read
on public.document_uploads for select
using (owner_user_id = private.current_user_id());

create policy document_uploads_owner_insert
on public.document_uploads for insert
with check (
  owner_user_id = private.current_user_id()
  and private.is_household_member(household_id)
  and (
    owner_person_id is null
    or exists (
      select 1
      from public.people p
      where p.id = owner_person_id
        and p.household_id = document_uploads.household_id
    )
  )
);

create policy document_uploads_owner_update
on public.document_uploads for update
using (owner_user_id = private.current_user_id())
with check (owner_user_id = private.current_user_id());

create policy document_uploads_owner_delete
on public.document_uploads for delete
using (
  owner_user_id = private.current_user_id()
  and status in ('intent_created','failed','expired','rejected')
);
