import { supabase } from './supabase';
import { AppUser } from '@/types/database';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAppUser(userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as AppUser;
}

export async function logActivity(
  barId: string,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string
) {
  await supabase.from('activity_log').insert({
    bar_id: barId,
    user_id: userId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
  });
}
