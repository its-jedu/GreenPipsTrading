-- Create files table
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.files enable row level security;

-- Policy: allow owners to SELECT their rows
create policy "Files: owners can select" on public.files
  for select
  using (owner_id = auth.uid());

-- Policy: allow owners to INSERT a row only if owner_id = auth.uid()
create policy "Files: owners can insert own rows" on public.files
  for insert
  with check (owner_id = auth.uid());

-- Policy: allow owners to UPDATE their own rows
create policy "Files: owners can update" on public.files
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Policy: allow owners to DELETE their own rows
create policy "Files: owners can delete" on public.files
  for delete
  using (owner_id = auth.uid());
