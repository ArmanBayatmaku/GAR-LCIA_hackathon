-- Minimal schema for hackathon backend
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  description text,
  status text not null default 'working' check (status in ('working','complete','intervention')),
  intake jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_owner on public.projects(owner_id);

-- Documents (metadata). Actual bytes are stored in Supabase Storage.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_project on public.documents(project_id);
create index if not exists idx_documents_owner on public.documents(owner_id);

-- Chat messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_project_created on public.messages(project_id, created_at);

-- Optional: trigger to update updated_at on projects
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- NOTE: For hackathon speed, this backend uses the service role key and enforces ownership in the API.
-- If you want true RLS, you can enable it and add policies. Example policies are provided below.

-- Uncomment to enable RLS:
-- alter table public.projects enable row level security;
-- alter table public.documents enable row level security;
-- alter table public.messages enable row level security;

-- Example policies:
-- create policy "projects_owner_select" on public.projects
--   for select using (owner_id = auth.uid());
-- create policy "projects_owner_insert" on public.projects
--   for insert with check (owner_id = auth.uid());
-- create policy "projects_owner_update" on public.projects
--   for update using (owner_id = auth.uid());
-- create policy "projects_owner_delete" on public.projects
--   for delete using (owner_id = auth.uid());

-- Similar policies can be created for documents/messages.
