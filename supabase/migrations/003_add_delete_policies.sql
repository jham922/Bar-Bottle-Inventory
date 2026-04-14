-- Add missing delete RLS policies

create policy "bottles: admin delete" on bottles for delete
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

create policy "inventory_scans: admin delete" on inventory_scans for delete
  using (bottle_id in (select id from bottles where bar_id = current_bar_id())
    and current_user_role() = 'admin');

create policy "alerts: admin delete" on alerts for delete
  using (bottle_id in (select id from bottles where bar_id = current_bar_id())
    and current_user_role() = 'admin');
