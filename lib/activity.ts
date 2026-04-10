import { supabase } from './supabase';

export interface ActivityItem {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  users: { display_name: string } | null;
}

export async function getRecentActivity(barId: string, limit = 20): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, user_id, created_at, users(display_name)')
    .eq('bar_id', barId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as ActivityItem[];
}
