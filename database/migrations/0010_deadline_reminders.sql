create table public.deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  deadline_id uuid not null references public.deadlines(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in (
    'preparation','30d','7d','1d','due','overdue'
  )),
  scheduled_on date not null,
  status text not null default 'scheduled' check (status in (
    'scheduled','ready','cancelled','dispatched'
  )),
  ready_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deadline_id, user_id, reminder_kind)
);

create index deadline_reminders_user_idx
  on public.deadline_reminders(user_id, status, scheduled_on, id);

create index deadline_reminders_due_idx
  on public.deadline_reminders(status, scheduled_on, id)
  where status='scheduled';

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null unique references public.deadline_reminders(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  event_type text not null default 'deadline_reminder'
    check (event_type in ('deadline_reminder')),
  channel text not null default 'in_app'
    check (channel in ('in_app','push','email')),
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending','leased','sent','failed','cancelled'
  )),
  available_at timestamptz not null default now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 20),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  last_error_code text,
  last_error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_outbox_dispatch_idx
  on public.notification_outbox(status, available_at, created_at, id)
  where status in ('pending','failed');

alter table public.deadline_reminders enable row level security;
alter table public.notification_outbox enable row level security;

create policy deadline_reminders_user_read
on public.deadline_reminders for select
using (user_id = private.current_user_id());

create policy notification_outbox_user_read
on public.notification_outbox for select
using (user_id = private.current_user_id());

create policy deadlines_reminder_worker_read
on public.deadlines for select
to lifeos_worker
using (true);

create policy obligations_reminder_worker_read
on public.obligations for select
to lifeos_worker
using (true);

create policy tasks_reminder_worker_read
on public.tasks for select
to lifeos_worker
using (true);

create policy deadline_reminders_worker_read
on public.deadline_reminders for select
to lifeos_worker
using (true);

create policy deadline_reminders_worker_insert
on public.deadline_reminders for insert
to lifeos_worker
with check (true);

create policy deadline_reminders_worker_update
on public.deadline_reminders for update
to lifeos_worker
using (true)
with check (true);

create policy notification_outbox_worker_read
on public.notification_outbox for select
to lifeos_worker
using (true);

create policy notification_outbox_worker_insert
on public.notification_outbox for insert
to lifeos_worker
with check (true);

create policy notification_outbox_worker_update
on public.notification_outbox for update
to lifeos_worker
using (true)
with check (true);

grant select on public.deadlines to lifeos_worker;
grant select on public.obligations to lifeos_worker;
grant select on public.tasks to lifeos_worker;
grant select, insert, update on public.deadline_reminders to lifeos_worker;
grant select, insert, update on public.notification_outbox to lifeos_worker;

create or replace function private.cancel_deadline_notifications(target_deadline_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deadline_reminders
  set status='cancelled', updated_at=now()
  where deadline_id=target_deadline_id
    and status in ('scheduled','ready');

  update public.notification_outbox o
  set status='cancelled',
      lease_owner=null,
      lease_expires_at=null,
      updated_at=now()
  from public.deadline_reminders r
  where r.id=o.reminder_id
    and r.deadline_id=target_deadline_id
    and o.status in ('pending','leased','failed');
end;
$$;

revoke all on function private.cancel_deadline_notifications(uuid) from public;
grant execute on function private.cancel_deadline_notifications(uuid) to lifeos_worker;

create or replace function private.cancel_notifications_when_deadline_closes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('completed','archived') then
    perform private.cancel_deadline_notifications(new.id);
  end if;
  return new;
end;
$$;

create trigger deadlines_cancel_notifications
  after update of status on public.deadlines
  for each row
  execute function private.cancel_notifications_when_deadline_closes();

create or replace function private.cancel_notifications_when_task_closes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('completed','cancelled')
     and new.deadline_id is not null then
    perform private.cancel_deadline_notifications(new.deadline_id);
  end if;
  return new;
end;
$$;

create trigger tasks_cancel_notifications
  after update of status on public.tasks
  for each row
  execute function private.cancel_notifications_when_task_closes();
