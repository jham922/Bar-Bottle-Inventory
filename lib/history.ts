import { supabase } from './supabase';
import { InventorySession, InventorySessionEntry } from '@/types/database';

export function filterLatestScansPerBottle<T extends { bottle_id: string }>(scans: T[]): T[] {
  const seen = new Set<string>();
  return scans.filter(s => {
    if (seen.has(s.bottle_id)) return false;
    seen.add(s.bottle_id);
    return true;
  });
}

export interface SessionWithMeta extends InventorySession {
  submitter_name: string;
}

export interface PendingBottle {
  bottle_id: string;
  brand: string;
  spirit_type: string;
  total_volume_ml: number;
  fill_pct: number;
  volume_remaining_ml: number;
  scanned_at: string;
}

// Returns the most recent session for this bar, or null if none exists
export async function getLastSession(barId: string): Promise<InventorySession | null> {
  const { data } = await supabase
    .from('inventory_sessions')
    .select('*')
    .eq('bar_id', barId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InventorySession) ?? null;
}

// Returns bottles with scans newer than sinceDate (all scans if sinceDate is null),
// one entry per bottle (the latest scan for that bottle in the window)
export async function getPendingBottles(barId: string, sinceDate: string | null): Promise<PendingBottle[]> {
  const baseQuery = supabase
    .from('inventory_scans')
    .select('bottle_id, fill_pct, volume_remaining_ml, scanned_at, bottles!inner(brand, spirit_type, total_volume_ml, bar_id)')
    .eq('bottles.bar_id', barId)
    .order('scanned_at', { ascending: false });

  const { data, error } = sinceDate
    ? await baseQuery.gt('scanned_at', sinceDate)
    : await baseQuery;

  if (error) throw error;

  const latest = filterLatestScansPerBottle((data ?? []) as any[]);

  return latest.map((s: any) => ({
    bottle_id: s.bottle_id,
    brand: s.bottles.brand,
    spirit_type: s.bottles.spirit_type,
    total_volume_ml: s.bottles.total_volume_ml,
    fill_pct: s.fill_pct,
    volume_remaining_ml: s.volume_remaining_ml,
    scanned_at: s.scanned_at,
  }));
}

// Creates a session row and inserts one entry per bottle
export async function submitInventoryCount(
  barId: string,
  userId: string,
  bottles: PendingBottle[],
): Promise<InventorySession> {
  const { data: session, error: sessionError } = await supabase
    .from('inventory_sessions')
    .insert({ bar_id: barId, submitted_by: userId, bottle_count: bottles.length })
    .select()
    .single();

  if (sessionError) throw sessionError;

  const entries = bottles.map(b => ({
    session_id: session.id,
    bottle_id: b.bottle_id,
    brand: b.brand,
    spirit_type: b.spirit_type,
    total_volume_ml: b.total_volume_ml,
    fill_pct: b.fill_pct,
    volume_remaining_ml: b.volume_remaining_ml,
    scanned_at: b.scanned_at,
  }));

  const { error: entriesError } = await supabase
    .from('inventory_session_entries')
    .insert(entries);

  if (entriesError) throw entriesError;

  return session as InventorySession;
}

// Returns all sessions for the bar, newest first, with submitter display name
export async function getInventorySessions(barId: string): Promise<SessionWithMeta[]> {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('*, users(display_name)')
    .eq('bar_id', barId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[]).map(s => ({
    id: s.id,
    bar_id: s.bar_id,
    submitted_by: s.submitted_by,
    submitted_at: s.submitted_at,
    bottle_count: s.bottle_count,
    submitter_name: s.users?.display_name ?? 'Unknown',
  }));
}

// Returns a single session by id, with submitter name
export async function getSession(sessionId: string): Promise<SessionWithMeta | null> {
  const { data } = await supabase
    .from('inventory_sessions')
    .select('*, users(display_name)')
    .eq('id', sessionId)
    .maybeSingle();

  if (!data) return null;
  const s = data as any;
  return {
    id: s.id,
    bar_id: s.bar_id,
    submitted_by: s.submitted_by,
    submitted_at: s.submitted_at,
    bottle_count: s.bottle_count,
    submitter_name: s.users?.display_name ?? 'Unknown',
  };
}

// Returns all entries for a session, sorted by brand name
export async function getInventorySessionEntries(sessionId: string): Promise<InventorySessionEntry[]> {
  const { data, error } = await supabase
    .from('inventory_session_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('brand');

  if (error) throw error;
  return (data ?? []) as InventorySessionEntry[];
}
