-- =========================================
-- Fix 6: Pin search_path on SECURITY DEFINER functions
-- =========================================

create or replace function current_bar_id()
returns uuid language sql security definer stable
set search_path = public, auth
as $$
  select bar_id from public.users where id = auth.uid();
$$;

create or replace function current_user_role()
returns text language sql security definer stable
set search_path = public, auth
as $$
  select role from public.users where id = auth.uid();
$$;

-- =========================================
-- Fix 7: users.bar_id NOT NULL
-- =========================================

alter table users alter column bar_id set not null;

-- =========================================
-- Fix 8: NOT NULL on timestamp columns
-- =========================================

alter table bar alter column created_at set not null;
alter table users alter column created_at set not null;
alter table bottles alter column created_at set not null;
alter table inventory_scans alter column scanned_at set not null;
alter table alerts alter column triggered_at set not null;
alter table recipes alter column created_at set not null;
alter table toast_uploads alter column uploaded_at set not null;
alter table activity_log alter column created_at set not null;

-- =========================================
-- Fix 1: alerts write policies — add bar scope
-- =========================================

drop policy if exists "alerts: admin write" on alerts;
drop policy if exists "alerts: admin update" on alerts;

create policy "alerts: admin write" on alerts for insert
  with check (current_user_role() = 'admin'
    and bottle_id in (select id from bottles where bar_id = current_bar_id()));
create policy "alerts: admin update" on alerts for update
  using (current_user_role() = 'admin'
    and bottle_id in (select id from bottles where bar_id = current_bar_id()));

-- =========================================
-- Fix 2: recipe_ingredients write policies — add bar scope
-- =========================================

drop policy if exists "recipe_ingredients: admin write" on recipe_ingredients;
drop policy if exists "recipe_ingredients: admin update" on recipe_ingredients;
drop policy if exists "recipe_ingredients: admin delete" on recipe_ingredients;

create policy "recipe_ingredients: admin write" on recipe_ingredients for insert
  with check (current_user_role() = 'admin'
    and recipe_id in (select id from recipes where bar_id = current_bar_id()));
create policy "recipe_ingredients: admin update" on recipe_ingredients for update
  using (current_user_role() = 'admin'
    and recipe_id in (select id from recipes where bar_id = current_bar_id()));
create policy "recipe_ingredients: admin delete" on recipe_ingredients for delete
  using (current_user_role() = 'admin'
    and recipe_id in (select id from recipes where bar_id = current_bar_id()));

-- =========================================
-- Fix 3: toast_uploads — split FOR ALL, add uploaded_by enforcement
-- =========================================

drop policy if exists "toast_uploads: admin" on toast_uploads;

create policy "toast_uploads: admin read" on toast_uploads for select
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "toast_uploads: admin insert" on toast_uploads for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id() and uploaded_by = auth.uid());
create policy "toast_uploads: admin update" on toast_uploads for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "toast_uploads: admin delete" on toast_uploads for delete
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- =========================================
-- Fix 4: invites — split FOR ALL, add invited_by enforcement
-- =========================================

drop policy if exists "invites: admin" on invites;

create policy "invites: admin read" on invites for select
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "invites: admin insert" on invites for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id() and invited_by = auth.uid());
create policy "invites: admin update" on invites for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "invites: admin delete" on invites for delete
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- =========================================
-- Fix 5: toast_sales — split FOR ALL for clarity
-- =========================================

drop policy if exists "toast_sales: admin" on toast_sales;

create policy "toast_sales: admin read" on toast_sales for select
  using (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');
create policy "toast_sales: admin insert" on toast_sales for insert
  with check (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');
create policy "toast_sales: admin update" on toast_sales for update
  using (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');
create policy "toast_sales: admin delete" on toast_sales for delete
  using (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');
