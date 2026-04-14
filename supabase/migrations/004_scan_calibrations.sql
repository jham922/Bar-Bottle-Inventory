create table scan_calibrations (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid references bar(id) on delete cascade not null,
  ai_fill_pct integer not null,
  corrected_fill_pct integer not null,
  created_at timestamptz default now()
);
alter table scan_calibrations enable row level security;
create policy "scan_calibrations: bar members all" on scan_calibrations
  for all using (bar_id = current_bar_id());
