import { supabase } from './supabase';
import { Alert as AlertRow, InventoryScan } from '@/types/database';

export interface ActiveAlert {
  id: string;
  bottle_id: string;
  brand: string;
  spirit_type: string;
  threshold_ml: number;
  triggered_at: string | null;
  current_fill_pct: number | null;
  current_volume_ml: number | null;
  ms_below_threshold: number | null;
}

export async function getActiveAlerts(barId: string): Promise<ActiveAlert[]> {
  // Get all unresolved alerts for bottles in this bar
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*, bottles!inner(bar_id, brand, spirit_type)')
    .eq('bottles.bar_id', barId)
    .is('resolved_at', null)
    .not('triggered_at', 'is', null);

  if (error) throw error;
  if (!alerts || alerts.length === 0) return [];

  const now = Date.now();

  const results: ActiveAlert[] = await Promise.all(
    alerts.map(async (a: any) => {
      const { data: latestScan } = await supabase
        .from('inventory_scans')
        .select('fill_pct, volume_remaining_ml')
        .eq('bottle_id', a.bottle_id)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const msBelowThreshold = a.triggered_at ? now - new Date(a.triggered_at).getTime() : null;

      return {
        id: a.id,
        bottle_id: a.bottle_id,
        brand: a.bottles.brand,
        spirit_type: a.bottles.spirit_type,
        threshold_ml: a.threshold_ml,
        triggered_at: a.triggered_at,
        current_fill_pct: latestScan?.fill_pct ?? null,
        current_volume_ml: latestScan?.volume_remaining_ml ?? null,
        ms_below_threshold: msBelowThreshold,
      };
    })
  );

  return results;
}

/**
 * Synchronous version — takes pre-fetched scans sorted ascending by scanned_at.
 * Used by reports.ts to avoid redundant DB queries.
 */
export function computeConsumptionFromScans(scans: { volume_remaining_ml: number }[]): number {
  if (scans.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < scans.length; i++) {
    const prev = scans[i - 1].volume_remaining_ml;
    const curr = scans[i].volume_remaining_ml;
    if (curr < prev) total += prev - curr;
  }
  return total;
}

export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Computes actual ml consumed for a bottle in a date range.
 * Handles bottle replacements: when volume goes up between scans,
 * that's a new bottle — count each segment separately.
 */
export async function computeActualUsage(
  bottleId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .select('volume_remaining_ml, scanned_at')
    .eq('bottle_id', bottleId)
    .gte('scanned_at', from)
    .lte('scanned_at', to)
    .order('scanned_at', { ascending: true });

  if (error) throw error;
  if (!data || data.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].volume_remaining_ml;
    const curr = data[i].volume_remaining_ml;
    if (curr < prev) {
      // Consumption in this segment
      total += prev - curr;
    }
    // If curr >= prev: bottle replaced — new segment starts from curr level, no consumption counted here
  }
  return total;
}
