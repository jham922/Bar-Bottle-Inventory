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
  // Fetch all bottles for this bar
  let query = supabase.from('bottles').select('*').eq('bar_id', barId).order('brand');
  if (spiritType) query = query.eq('spirit_type', spiritType);
  if (search) query = query.ilike('brand', `%${search}%`);

  const { data: bottles, error } = await query;
  if (error) throw error;
  if (!bottles || bottles.length === 0) return [];

  // For each bottle, get its latest scan
  const results: BottleWithLatestScan[] = await Promise.all(
    (bottles as Bottle[]).map(async (bottle) => {
      const { data: latestScan } = await supabase
        .from('inventory_scans')
        .select('fill_pct, volume_remaining_ml, scanned_at')
        .eq('bottle_id', bottle.id)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...bottle,
        fill_pct: latestScan?.fill_pct ?? null,
        volume_remaining_ml: latestScan?.volume_remaining_ml ?? null,
        scanned_at: latestScan?.scanned_at ?? null,
      };
    })
  );

  return results;
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
