-- inventory_sessions: one row per submitted inventory count
create table inventory_sessions (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  submitted_by uuid not null references users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  bottle_count integer not null default 0
);

-- inventory_session_entries: one row per bottle in a snapshot
-- brand/spirit_type/total_volume_ml are copied so history survives bottle edits/deletes
create table inventory_session_entries (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references inventory_sessions(id) on delete cascade,
  bottle_id uuid references bottles(id) on delete set null,
  brand text not null,
  spirit_type text not null,
  total_volume_ml numeric not null,
  fill_pct numeric not null,
  volume_remaining_ml numeric not null,
  scanned_at timestamptz not null
);

alter table inventory_sessions enable row level security;
alter table inventory_session_entries enable row level security;

-- Any bar member can insert a session (their own)
create policy "sessions: any insert" on inventory_sessions for insert
  with check (bar_id = current_bar_id() and submitted_by = auth.uid());

-- Admins can read sessions for their bar
create policy "sessions: admin select" on inventory_sessions for select
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- Any bar member can insert entries into sessions that belong to their bar
create policy "session_entries: any insert" on inventory_session_entries for insert
  with check (
    session_id in (select id from inventory_sessions where bar_id = current_bar_id())
  );

-- Admins can read entries for their bar's sessions
create policy "session_entries: admin select" on inventory_session_entries for select
  using (
    session_id in (select id from inventory_sessions where bar_id = current_bar_id())
    and current_user_role() = 'admin'
  );
