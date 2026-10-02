create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  home_jurisdiction text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','adult','guardian','dependent','professional','emergency_contact')),
  status text not null default 'active' check (status in ('invited','active','revoked')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  relationship text,
  date_of_birth date,
  nationality text,
  jurisdiction text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_person_id uuid references public.people(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
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
  user_id uuid not null references auth.users(id) on delete cascade,
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
  created_by uuid references auth.users(id) on delete set null,
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
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  status text not null default 'ready' check (status in ('ready','in_progress','blocked','completed','cancelled','action_due')),
  due_at date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  household_id uuid references public.households(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
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
      and hm.user_id = (select auth.uid())
      and hm.status = 'active'
  ) or exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.created_by = (select auth.uid())
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
    select 1
    from public.households h
    where h.id = target_household_id
      and h.created_by = (select auth.uid())
  ) or exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
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
    select 1
    from public.documents d
    where d.id = target_document_id
      and d.owner_user_id = (select auth.uid())
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
    select 1
    from public.documents d
    where d.id = target_document_id
      and (
        d.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.document_shares s
          where s.document_id = d.id
            and s.user_id = (select auth.uid())
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
    select 1
    from public.documents d
    where d.id = target_document_id
      and (
        d.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.document_shares s
          where s.document_id = d.id
            and s.user_id = (select auth.uid())
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
    select 1
    from public.obligations o
    where o.id = target_obligation_id
      and (
        o.created_by = (select auth.uid())
        or (o.source_document_id is not null and private.can_read_document(o.source_document_id))
      )
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.is_household_owner(uuid) from public;
revoke all on function private.owns_document(uuid) from public;
revoke all on function private.can_read_document(uuid) from public;
revoke all on function private.can_edit_document(uuid) from public;
revoke all on function private.can_read_obligation(uuid) from public;

grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;
grant execute on function private.owns_document(uuid) to authenticated;
grant execute on function private.can_read_document(uuid) to authenticated;
grant execute on function private.can_edit_document(uuid) to authenticated;
grant execute on function private.can_read_obligation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
alter table public.document_facts enable row level security;
alter table public.obligations enable row level security;
alter table public.deadlines enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users create their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "Users update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Members read households"
on public.households for select to authenticated
using (private.is_household_member(id));

create policy "Users create households"
on public.households for insert to authenticated
with check ((select auth.uid()) = created_by);

create policy "Owners update households"
on public.households for update to authenticated
using (private.is_household_owner(id))
with check (private.is_household_owner(id));

create policy "Owners delete households"
on public.households for delete to authenticated
using (private.is_household_owner(id));

create policy "Members read household membership"
on public.household_members for select to authenticated
using (private.is_household_member(household_id));

create policy "Owners add household members"
on public.household_members for insert to authenticated
with check (private.is_household_owner(household_id));

create policy "Owners update household members"
on public.household_members for update to authenticated
using (private.is_household_owner(household_id))
with check (private.is_household_owner(household_id));

create policy "Owners remove household members"
on public.household_members for delete to authenticated
using (private.is_household_owner(household_id));

create policy "Members read people metadata"
on public.people for select to authenticated
using (private.is_household_member(household_id));

create policy "Members create people metadata"
on public.people for insert to authenticated
with check (
  private.is_household_member(household_id)
  and (select auth.uid()) = created_by
);

create policy "Creators or owners update people metadata"
on public.people for update to authenticated
using (
  created_by = (select auth.uid())
  or private.is_household_owner(household_id)
)
with check (
  created_by = (select auth.uid())
  or private.is_household_owner(household_id)
);

create policy "Creators or owners delete people metadata"
on public.people for delete to authenticated
using (
  created_by = (select auth.uid())
  or private.is_household_owner(household_id)
);

create policy "Authorized users read documents"
on public.documents for select to authenticated
using (private.can_read_document(id));

create policy "Members create private documents"
on public.documents for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and private.is_household_member(household_id)
);

create policy "Authorized editors update documents"
on public.documents for update to authenticated
using (private.can_edit_document(id))
with check (private.can_edit_document(id));

create policy "Owners delete documents"
on public.documents for delete to authenticated
using (owner_user_id = (select auth.uid()));

create policy "Owners and recipients read document shares"
on public.document_shares for select to authenticated
using (
  user_id = (select auth.uid())
  or private.owns_document(document_id)
);

create policy "Document owners create shares"
on public.document_shares for insert to authenticated
with check (private.owns_document(document_id));

create policy "Document owners update shares"
on public.document_shares for update to authenticated
using (private.owns_document(document_id))
with check (private.owns_document(document_id));

create policy "Document owners delete shares"
on public.document_shares for delete to authenticated
using (private.owns_document(document_id));

create policy "Document readers read facts"
on public.document_facts for select to authenticated
using (private.can_read_document(document_id));

create policy "Authorized users read obligations"
on public.obligations for select to authenticated
using (
  created_by = (select auth.uid())
  or (source_document_id is not null and private.can_read_document(source_document_id))
);

create policy "Authorized users read deadlines"
on public.deadlines for select to authenticated
using (private.can_read_obligation(obligation_id));

create policy "Task participants read tasks"
on public.tasks for select to authenticated
using (
  created_by = (select auth.uid())
  or assigned_to_user_id = (select auth.uid())
);

create policy "Members create tasks"
on public.tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_household_member(household_id)
);

create policy "Task participants update tasks"
on public.tasks for update to authenticated
using (
  created_by = (select auth.uid())
  or assigned_to_user_id = (select auth.uid())
)
with check (
  created_by = (select auth.uid())
  or assigned_to_user_id = (select auth.uid())
);

create policy "Task creators delete tasks"
on public.tasks for delete to authenticated
using (created_by = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.people to authenticated;
grant select, insert, delete on public.documents to authenticated;
grant update (title, issuer, jurisdiction, status, sensitivity) on public.documents to authenticated;
grant select, insert, update, delete on public.document_shares to authenticated;
grant select on public.document_facts to authenticated;
grant select on public.obligations to authenticated;
grant select on public.deadlines to authenticated;
grant select, insert, delete on public.tasks to authenticated;
grant update (status, completed_at) on public.tasks to authenticated;
