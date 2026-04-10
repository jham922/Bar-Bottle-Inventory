-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Bar (single row, all users belong to one bar)
create table bar (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  bar_id uuid references bar(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

-- Bottles catalog
create table bottles (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  brand text not null,
  spirit_type text not null,
  total_volume_ml numeric not null,
  bottle_image_ref text,
  created_at timestamptz default now()
);

-- Inventory scans
create table inventory_scans (
  id uuid primary key default uuid_generate_v4(),
  bottle_id uuid not null references bottles(id) on delete cascade,
  fill_pct numeric not null check (fill_pct >= 0 and fill_pct <= 100),
  volume_remaining_ml numeric not null,
  scan_image_url text,
  scanned_by uuid not null references users(id),
  scanned_at timestamptz default now()
);

-- Alerts
create table alerts (
  id uuid primary key default uuid_generate_v4(),
  bottle_id uuid not null references bottles(id) on delete cascade,
  threshold_ml numeric not null,
  triggered_at timestamptz default now(),
  resolved_at timestamptz
);

-- Recipes
create table recipes (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  name text not null,
  toast_menu_item_name text,
  created_at timestamptz default now()
);

-- Recipe ingredients
create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  bottle_id uuid references bottles(id) on delete set null,
  ingredient_name text not null,
  quantity_oz numeric not null,
  tracked boolean not null default true
);

-- Toast uploads
create table toast_uploads (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  date_range_start date not null,
  date_range_end date not null,
  uploaded_at timestamptz default now()
);

-- Toast sales
create table toast_sales (
  id uuid primary key default uuid_generate_v4(),
  upload_id uuid not null references toast_uploads(id) on delete cascade,
  recipe_id uuid references recipes(id) on delete set null,
  menu_item_name text not null,
  units_sold integer not null
);

-- Activity log
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  created_at timestamptz default now()
);

-- Pending invites
create table invites (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  invited_by uuid not null references users(id),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  accepted_at timestamptz
);

-- =========================================
-- Row Level Security
-- =========================================

alter table bar enable row level security;
alter table users enable row level security;
alter table bottles enable row level security;
alter table inventory_scans enable row level security;
alter table alerts enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table toast_uploads enable row level security;
alter table toast_sales enable row level security;
alter table activity_log enable row level security;
alter table invites enable row level security;

-- Helper: get current user's bar_id
create or replace function current_bar_id()
returns uuid language sql security definer stable as $$
  select bar_id from users where id = auth.uid();
$$;

-- Helper: get current user's role
create or replace function current_user_role()
returns text language sql security definer stable as $$
  select role from users where id = auth.uid();
$$;

-- bar: users can read their own bar
create policy "bar: read own" on bar for select
  using (id = current_bar_id());

-- users: read all in same bar
create policy "users: read same bar" on users for select
  using (bar_id = current_bar_id());

-- users: admin can update roles
create policy "users: admin update" on users for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- bottles: all in same bar can read; only admin can insert/update/delete
create policy "bottles: read same bar" on bottles for select
  using (bar_id = current_bar_id());
create policy "bottles: admin write" on bottles for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "bottles: admin update" on bottles for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- inventory_scans: all in same bar can read and insert
create policy "scans: read same bar" on inventory_scans for select
  using (bottle_id in (select id from bottles where bar_id = current_bar_id()));
create policy "scans: any insert" on inventory_scans for insert
  with check (bottle_id in (select id from bottles where bar_id = current_bar_id()));

-- alerts: all read, admin write
create policy "alerts: read same bar" on alerts for select
  using (bottle_id in (select id from bottles where bar_id = current_bar_id()));
create policy "alerts: admin write" on alerts for insert
  with check (current_user_role() = 'admin');
create policy "alerts: admin update" on alerts for update
  using (current_user_role() = 'admin');

-- recipes: all read, admin write
create policy "recipes: read same bar" on recipes for select
  using (bar_id = current_bar_id());
create policy "recipes: admin write" on recipes for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "recipes: admin update" on recipes for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "recipes: admin delete" on recipes for delete
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- recipe_ingredients: follow recipe access
create policy "recipe_ingredients: read" on recipe_ingredients for select
  using (recipe_id in (select id from recipes where bar_id = current_bar_id()));
create policy "recipe_ingredients: admin write" on recipe_ingredients for insert
  with check (current_user_role() = 'admin');
create policy "recipe_ingredients: admin update" on recipe_ingredients for update
  using (current_user_role() = 'admin');
create policy "recipe_ingredients: admin delete" on recipe_ingredients for delete
  using (current_user_role() = 'admin');

-- toast_uploads / toast_sales: admin only
create policy "toast_uploads: admin" on toast_uploads for all
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "toast_sales: admin" on toast_sales for all
  using (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');

-- activity_log: admin read, any insert
create policy "activity_log: admin read" on activity_log for select
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "activity_log: any insert" on activity_log for insert
  with check (bar_id = current_bar_id());

-- invites: admin manage
create policy "invites: admin" on invites for all
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
