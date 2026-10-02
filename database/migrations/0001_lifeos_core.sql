create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table public.app_users (
  id uuid primary key,
  email text,
  display_name text,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  status text not null default 'active' check (status in ('active','disabled','deleted')),
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  home_jurisdiction text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('owner','adult','guardian','dependent','professional','emergency_contact')),
  status text not null default 'active' check (status in ('invited','active','revoked')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  linked_user_id uuid references public.app_users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  relationship text,
  date_of_birth date,
  nationality text,
  jurisdiction text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_person_id uuid references public.people(id) on delete set null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  document_type text not null check (document_type in (
    'passport','identity_card','driving_license','insurance','visa',
    'residence_permit','vehicle_registration','contract','invoice',
    'certificate','other'
  )),
  title text,
  issuer text,
  jurisdiction text,
  status text not null default 'active' check (status in ('processing','active','expired','archived')),
  sensitivity text not null default 'high' check (sensitivity in ('normal','high','restricted')),
  created_at timestamptz not null default now()
);

create table public.document_shares (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  can_edit boolean not null default false,
  shared_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create table public.document_facts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  field_key text not null,
  value_json jsonb not null,
  normalized_value text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  origin text not null check (origin in ('verified_source','ai_extracted','ai_inferred','user_confirmed')),
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','corrected','rejected')),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  source_document_id uuid references public.documents(id) on delete set null,
  obligation_type text not null,
  title text not null,
  description text,
  status text not null default 'detected' check (status in ('detected','confirmed','protected','action_due','completed','archived')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  rule_code text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  due_at date not null,
  recommended_action_at date,
  severity text not null check (severity in ('normal','important','urgent','critical','overdue')),
  status text not null default 'protected' check (status in ('detected','confirmed','protected','action_due','completed','archived','overdue')),
  source text not null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  deadline_id uuid references public.deadlines(id) on delete set null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  assigned_to_user_id uuid references public.app_users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  status text not null default 'ready' check (status in ('ready','in_progress','blocked','completed','cancelled','action_due')),
  due_at date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.idempotency_records (
  user_id uuid not null references public.app_users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  request_hash text not null,
  response_json jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (user_id, key)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  household_id uuid references public.households(id) on delete set null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index household_members_user_idx on public.household_members(user_id, household_id) where status = 'active';
create index people_household_idx on public.people(household_id);
create index documents_household_idx on public.documents(household_id);
create index documents_owner_idx on public.documents(owner_user_id);
create index document_shares_user_idx on public.document_shares(user_id, document_id);
create index document_facts_document_idx on public.document_facts(document_id);
create index obligations_household_idx on public.obligations(household_id);
create index obligations_source_document_idx on public.obligations(source_document_id);
create index deadlines_obligation_idx on public.deadlines(obligation_id);
create index tasks_household_idx on public.tasks(household_id);
create index tasks_assignee_idx on public.tasks(assigned_to_user_id);
create index idempotency_expiry_idx on public.idempotency_records(expires_at);

create or replace function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('lifeos.user_id', true), '')::uuid;
$$;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = private.current_user_id()
      and hm.status = 'active'
  ) or exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.created_by = private.current_user_id()
  );
$$;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households h
    where h.id = target_household_id
      and h.created_by = private.current_user_id()
  ) or exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = private.current_user_id()
      and hm.status = 'active'
      and hm.role = 'owner'
  );
$$;

create or replace function private.owns_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id
      and d.owner_user_id = private.current_user_id()
  );
$$;

create or replace function private.can_read_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id
      and (
        d.owner_user_id = private.current_user_id()
        or exists (
          select 1 from public.document_shares s
          where s.document_id = d.id
            and s.user_id = private.current_user_id()
        )
      )
  );
$$;

create or replace function private.can_edit_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id
      and (
        d.owner_user_id = private.current_user_id()
        or exists (
          select 1 from public.document_shares s
          where s.document_id = d.id
            and s.user_id = private.current_user_id()
            and s.can_edit
        )
      )
  );
$$;

create or replace function private.can_read_obligation(target_obligation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.obligations o
    where o.id = target_obligation_id
      and (
        o.created_by = private.current_user_id()
        or (o.source_document_id is not null and private.can_read_document(o.source_document_id))
      )
  );
$$;

alter table public.app_users enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
alter table public.document_facts enable row level security;
alter table public.obligations enable row level security;
alter table public.deadlines enable row level security;
alter table public.tasks enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.audit_logs enable row level security;

create policy app_users_self_read on public.app_users for select using (id = private.current_user_id());
create policy app_users_self_update on public.app_users for update using (id = private.current_user_id()) with check (id = private.current_user_id());

create policy households_member_read on public.households for select using (private.is_household_member(id));
create policy households_owner_insert on public.households for insert with check (created_by = private.current_user_id());
create policy households_owner_update on public.households for update using (private.is_household_owner(id)) with check (private.is_household_owner(id));

create policy household_members_member_read on public.household_members for select using (private.is_household_member(household_id));
create policy household_members_owner_write on public.household_members for all
  using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));

create policy people_member_read on public.people for select using (private.is_household_member(household_id));
create policy people_member_insert on public.people for insert with check (
  private.is_household_member(household_id) and created_by = private.current_user_id()
);
create policy people_creator_or_owner_update on public.people for update
  using (created_by = private.current_user_id() or private.is_household_owner(household_id))
  with check (created_by = private.current_user_id() or private.is_household_owner(household_id));

create policy documents_authorized_read on public.documents for select using (private.can_read_document(id));
create policy documents_owner_insert on public.documents for insert with check (
  owner_user_id = private.current_user_id() and private.is_household_member(household_id)
);
create policy documents_authorized_edit on public.documents for update
  using (private.can_edit_document(id))
  with check (private.can_edit_document(id));
create policy documents_owner_delete on public.documents for delete using (owner_user_id = private.current_user_id());

create policy document_shares_authorized_read on public.document_shares for select using (
  user_id = private.current_user_id() or private.owns_document(document_id)
);
create policy document_shares_owner_write on public.document_shares for all
  using (private.owns_document(document_id))
  with check (private.owns_document(document_id));

create policy document_facts_document_read on public.document_facts for select using (private.can_read_document(document_id));
create policy document_facts_document_owner_insert on public.document_facts for insert with check (private.owns_document(document_id));

create policy obligations_authorized_read on public.obligations for select using (
  created_by = private.current_user_id()
  or (source_document_id is not null and private.can_read_document(source_document_id))
);
create policy obligations_creator_insert on public.obligations for insert with check (
  created_by = private.current_user_id() and private.is_household_member(household_id)
);

create policy deadlines_authorized_read on public.deadlines for select using (private.can_read_obligation(obligation_id));
create policy deadlines_authorized_insert on public.deadlines for insert with check (
  private.is_household_member(household_id) and private.can_read_obligation(obligation_id)
);

create policy tasks_participant_read on public.tasks for select using (
  created_by = private.current_user_id() or assigned_to_user_id = private.current_user_id()
);
create policy tasks_member_insert on public.tasks for insert with check (
  created_by = private.current_user_id() and private.is_household_member(household_id)
);
create policy tasks_participant_update on public.tasks for update
  using (created_by = private.current_user_id() or assigned_to_user_id = private.current_user_id())
  with check (created_by = private.current_user_id() or assigned_to_user_id = private.current_user_id());

create policy idempotency_self_all on public.idempotency_records for all
  using (user_id = private.current_user_id())
  with check (user_id = private.current_user_id());

create policy audit_actor_insert on public.audit_logs for insert with check (
  actor_user_id = private.current_user_id()
  and (household_id is null or private.is_household_member(household_id))
);
create policy audit_member_read on public.audit_logs for select using (
  household_id is not null and private.is_household_member(household_id)
);
