import { supabase } from './supabase';
import { Invite, Role } from '@/types/database';

export async function createInvite(
  barId: string,
  invitedBy: string,
  email: string,
  role: Role
): Promise<Invite> {
  const { data, error } = await supabase
    .from('invites')
    .insert({ bar_id: barId, invited_by: invitedBy, email, role })
    .select()
    .single();
  if (error) throw error;
  return data as Invite;
}

export async function getPendingInvites(barId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('bar_id', barId)
    .is('accepted_at', null);
  if (error) throw error;
  return data as Invite[];
}

export async function acceptInvite(token: string, displayName: string, password: string): Promise<void> {
  // 1. Look up the invite
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single();
  if (inviteError || !invite) throw new Error('Invalid or expired invite link.');
  if (new Date(invite.expires_at) < new Date()) throw new Error('This invite has expired.');

  // 2. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: invite.email,
    password,
  });
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('User creation failed.');

  // 3. Create users row
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    bar_id: invite.bar_id,
    display_name: displayName,
    role: invite.role,
  });
  if (userError) throw userError;

  // 4. Mark invite accepted
  await supabase.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
}
