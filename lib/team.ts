import { supabase } from './supabase';
import { AppUser, Role } from '@/types/database';

export async function getTeamMembers(barId: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('bar_id', barId);
  if (error) throw error;
  return data as AppUser[];
}

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

export async function removeUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  if (error) throw error;
}
