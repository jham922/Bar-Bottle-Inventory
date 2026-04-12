import { supabase } from './supabase';
import { Bottle, InventoryScan } from '@/types/database';

export async function findBottleByBrand(barId: string, brand: string): Promise<Bottle | null> {
  const { data } = await supabase
    .from('bottles')
    .select('*')
    .eq('bar_id', barId)
    .ilike('brand', brand)
    .maybeSingle();
  return data as Bottle | null;
}

export async function createBottle(
  barId: string,
  brand: string,
  spiritType: string,
  totalVolumeMl: number,
  bottleImageRef?: string
): Promise<Bottle> {
  const { data, error } = await supabase
    .from('bottles')
    .insert({ bar_id: barId, brand, spirit_type: spiritType, total_volume_ml: totalVolumeMl, bottle_image_ref: bottleImageRef ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Bottle;
}

export async function saveInventoryScan(
  bottleId: string,
  fillPct: number,
  volumeRemainingMl: number,
  scannedBy: string,
  scanImageUrl?: string
): Promise<InventoryScan> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .insert({ bottle_id: bottleId, fill_pct: fillPct, volume_remaining_ml: volumeRemainingMl, scanned_by: scannedBy, scan_image_url: scanImageUrl ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryScan;
}

export async function checkAndTriggerAlert(bottleId: string, volumeRemainingMl: number): Promise<void> {
  const { data: alert } = await supabase
    .from('alerts')
    .select('*')
    .eq('bottle_id', bottleId)
    .is('resolved_at', null)
    .maybeSingle();

  if (!alert) return;

  if (volumeRemainingMl < alert.threshold_ml && !alert.triggered_at) {
    // First time below threshold — record when the alert fired
    await supabase.from('alerts').update({ triggered_at: new Date().toISOString() }).eq('id', alert.id);
  } else if (volumeRemainingMl >= alert.threshold_ml && alert.triggered_at) {
    // Back above threshold and was previously triggered — resolve it
    await supabase.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alert.id);
  }
  // If below threshold but already triggered, or above threshold but never triggered: no-op
}
