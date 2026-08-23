-- =========================================================================
-- liswan.dev — Client Portal & Admin Panel database schema (Supabase/Postgres)
-- Run this in the Supabase SQL editor on a fresh project.
-- Auth: uses Supabase's built-in auth.users; public.users extends it with role.
-- =========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role as enum ('admin','client');
create type project_status as enum (
  'inquiry','planning','design','development','testing',
  'revision','deployment','completed','maintenance'
);
create type approval_status as enum ('pending','approved','revision_requested');
create type revision_status as enum ('submitted','in_progress','completed','approved');
create type invoice_status as enum ('unpaid','partial','paid');
create type priority_level as enum ('low','normal','high','urgent');
create type file_category as enum ('design','documents','delivery');

-- ---------------------------------------------------------------------
-- CLIENTS (company-level record)
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  email text,
  whatsapp text,
  address text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- USERS (profile extension of auth.users)
-- role='client' users belong to exactly one client company.
-- role='admin' users are internal (developer/PM).
-- ---------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'client',
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin');
$$;

create or replace function public.current_client_id()
returns uuid language sql stable security definer as $$
  select client_id from public.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  description text,
  status project_status not null default 'inquiry',
  progress smallint not null default 0 check (progress between 0 and 100),
  project_manager uuid references public.users(id),
  start_date date,
  target_date date,
  budget_range text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which users (client-side or internal) can access a project.
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_in_project text default 'member',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- Timeline / activity entries shown on the project Timeline tab.
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- Internal task breakdown (admin-managed, not client-facing by default).
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  assigned_to uuid references public.users(id),
  due_date date,
  created_at timestamptz not null default now()
);

-- File Center entries.
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category file_category not null default 'design',
  file_name text not null,
  file_size_kb integer,
  storage_path text,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- Discussion thread (project-scoped, not a chat app).
create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid references public.users(id),
  sender_role user_role not null,
  message text,
  attachment_url text,
  created_at timestamptz not null default now()
);

-- Revision requests raised by the client.
create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null,
  description text not null,
  attachment_url text,
  priority priority_level not null default 'normal',
  status revision_status not null default 'submitted',
  submitted_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliverables awaiting client sign-off.
create table public.project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  preview_url text,
  status approval_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users(id)
);

-- ---------------------------------------------------------------------
-- INVOICES
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invoice_number text not null unique,
  total_amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  status invoice_status not null default 'unpaid',
  due_date date,
  created_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  qty integer not null default 1,
  unit_price numeric(14,2) not null
);

-- ---------------------------------------------------------------------
-- PROJECT REQUESTS — public "Start a Project" builder + client "New Project"
-- ---------------------------------------------------------------------
create table public.project_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  project_type text not null,
  complexity text,
  features text[],
  company_name text,
  contact_person text,
  email text,
  whatsapp text,
  description text,
  target_date date,
  budget_range text,
  estimated_dev_time text,
  recommended_tech text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS & ACTIVITY LOG
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  project_id uuid references public.projects(id),
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
alter table public.clients enable row level security;
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_files enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_revisions enable row level security;
alter table public.project_approvals enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.project_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

-- USERS
create policy "users_select_self_or_admin" on public.users
  for select using (id = auth.uid() or public.is_admin());
create policy "users_admin_write" on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- CLIENTS
create policy "clients_select" on public.clients
  for select using (public.is_admin() or id = public.current_client_id());
create policy "clients_admin_write" on public.clients
  for all using (public.is_admin()) with check (public.is_admin());

-- PROJECTS
create policy "projects_select" on public.projects
  for select using (public.is_admin() or client_id = public.current_client_id());
create policy "projects_admin_write" on public.projects
  for all using (public.is_admin()) with check (public.is_admin());

-- Generic pattern for project-child tables: client can read rows of their own
-- projects; only admin can write, except where clients explicitly submit
-- (messages, revisions, approval decisions) — see dedicated policies below.
create policy "project_members_select" on public.project_members
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_members_admin_write" on public.project_members
  for all using (public.is_admin()) with check (public.is_admin());

create policy "project_updates_select" on public.project_updates
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_updates_admin_write" on public.project_updates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "project_tasks_select" on public.project_tasks
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_tasks_admin_write" on public.project_tasks
  for all using (public.is_admin()) with check (public.is_admin());

create policy "project_files_select" on public.project_files
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_files_admin_write" on public.project_files
  for all using (public.is_admin()) with check (public.is_admin());

-- MESSAGES: client can read + post into their own project's discussion.
create policy "project_messages_select" on public.project_messages
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_messages_client_insert" on public.project_messages
  for insert with check (
    public.is_admin() or (
      sender_id = auth.uid() and exists (
        select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
      )
    )
  );

-- REVISIONS: client can read + submit for their own project; only admin updates status.
create policy "project_revisions_select" on public.project_revisions
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_revisions_client_insert" on public.project_revisions
  for insert with check (
    public.is_admin() or (
      submitted_by = auth.uid() and exists (
        select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
      )
    )
  );
create policy "project_revisions_admin_update" on public.project_revisions
  for update using (public.is_admin()) with check (public.is_admin());

-- APPROVALS: client can read + decide (approve / request revision) on their own project.
create policy "project_approvals_select" on public.project_approvals
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "project_approvals_admin_insert" on public.project_approvals
  for insert with check (public.is_admin());
create policy "project_approvals_client_decide" on public.project_approvals
  for update using (
    public.is_admin() or exists (
      select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
    )
  );

-- INVOICES
create policy "invoices_select" on public.invoices
  for select using (public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = public.current_client_id()
  ));
create policy "invoices_admin_write" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

create policy "invoice_items_select" on public.invoice_items
  for select using (public.is_admin() or exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and p.client_id = public.current_client_id()
  ));
create policy "invoice_items_admin_write" on public.invoice_items
  for all using (public.is_admin()) with check (public.is_admin());

-- PROJECT REQUESTS: anyone (including anonymous public visitors) can submit;
-- only admin (or the owning client) can read them back.
create policy "project_requests_public_insert" on public.project_requests
  for insert with check (true);
create policy "project_requests_select" on public.project_requests
  for select using (
    public.is_admin() or (client_id is not null and client_id = public.current_client_id())
  );

-- NOTIFICATIONS: users see + update (mark read) only their own.
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin());
create policy "notifications_admin_insert" on public.notifications
  for insert with check (public.is_admin());

-- ACTIVITY LOGS: admin only.
create policy "activity_logs_admin_only" on public.activity_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- Auto-create a public.users row whenever a new auth.users row is created.
-- Defaults new sign-ups to role='client'; promote to 'admin' manually in
-- the table editor for internal accounts.
-- =========================================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
