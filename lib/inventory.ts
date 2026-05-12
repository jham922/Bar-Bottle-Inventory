import { supabase } from './supabase';
import { Bottle, InventoryScan } from '@/types/database';

export const SPIRIT_TYPES = ['Whiskey', 'Gin', 'Vodka', 'Rum', 'Tequila', 'Mezcal', 'Liqueur', 'Amaro', 'Brandy', 'Other'];

export interface BottleWithLatestScan extends Bottle {
  fill_pct: number | null;
  volume_remaining_ml: number | null;
  scanned_at: string | null;
}

export async function getInventoryList(
  barId: string,
  search?: string,
  spiritType?: string,
): Promise<BottleWithLatestScan[]> {
  // Query 1: all bottles for the bar (with optional filters)
  let query = supabase.from('bottles').select('*').eq('bar_id', barId).order('brand');
  if (spiritType) query = query.eq('spirit_type', spiritType);
  if (search) query = query.ilike('brand', `%${search}%`);

  const { data: bottles, error: bottlesError } = await query;
  if (bottlesError) throw bottlesError;
  if (!bottles || bottles.length === 0) return [];

  // Query 2: all scans for those bottles in one request, newest first
  const bottleIds = (bottles as Bottle[]).map(b => b.id);
  const { data: scans, error: scansError } = await supabase
    .from('inventory_scans')
    .select('bottle_id, fill_pct, volume_remaining_ml, scanned_at')
    .in('bottle_id', bottleIds)
    .order('scanned_at', { ascending: false });
  if (scansError) throw scansError;

  // Build map: bottle_id → latest scan (first occurrence wins since rows are sorted desc)
  const latestByBottle = new Map<string, { fill_pct: number; volume_remaining_ml: number; scanned_at: string }>();
  for (const scan of (scans ?? []) as any[]) {
    if (!latestByBottle.has(scan.bottle_id)) {
      latestByBottle.set(scan.bottle_id, scan);
    }
  }

  return (bottles as Bottle[]).map(bottle => {
    const latest = latestByBottle.get(bottle.id);
    return {
      ...bottle,
      fill_pct: latest?.fill_pct ?? null,
      volume_remaining_ml: latest?.volume_remaining_ml ?? null,
      scanned_at: latest?.scanned_at ?? null,
    };
  });
}

// Deletes all inventory_scans for this bar. Does not touch inventory_sessions or history.
export async function clearAllScans(barId: string): Promise<void> {
  const { data: bottles, error: bottlesError } = await supabase
    .from('bottles')
    .select('id')
    .eq('bar_id', barId);
  if (bottlesError) throw bottlesError;
  if (!bottles || bottles.length === 0) return;

  const ids = (bottles as { id: string }[]).map(b => b.id);
  const { error } = await supabase
    .from('inventory_scans')
    .delete()
    .in('bottle_id', ids);
  if (error) throw error;
}

export async function getBottleHistory(bottleId: string): Promise<InventoryScan[]> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .select('*')
    .eq('bottle_id', bottleId)
    .order('scanned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventoryScan[];
}
