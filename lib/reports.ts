import { supabase } from './supabase';
import { computeConsumptionFromScans } from './alerts';
import { computeTheoreticalUsage, ToastSaleRow } from './toast';
import { RecipeWithIngredients } from './recipes';

export interface ConsumptionReportItem {
  bottle_id: string;
  brand: string;
  spirit_type: string;
  consumed_ml: number;
}

export async function getConsumptionReport(
  barId: string,
  dateStart: string,
  dateEnd: string
): Promise<ConsumptionReportItem[]> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .select('bottle_id, volume_remaining_ml, scanned_at, bottles!inner(brand, spirit_type, bar_id)')
    .gte('scanned_at', `${dateStart}T00:00:00Z`)
    .lte('scanned_at', `${dateEnd}T23:59:59Z`)
    .order('scanned_at', { ascending: true });
  if (error) throw error;

  const byBottle: Record<string, { brand: string; spirit_type: string; scans: { volume_remaining_ml: number; scanned_at: string }[] }> = {};

  for (const row of (data as any[])) {
    if (row.bottles.bar_id !== barId) continue;
    if (!byBottle[row.bottle_id]) {
      byBottle[row.bottle_id] = { brand: row.bottles.brand, spirit_type: row.bottles.spirit_type, scans: [] };
    }
    byBottle[row.bottle_id].scans.push({ volume_remaining_ml: row.volume_remaining_ml, scanned_at: row.scanned_at });
  }

  return Object.entries(byBottle)
    .map(([bottle_id, { brand, spirit_type, scans }]) => ({
      bottle_id,
      brand,
      spirit_type,
      consumed_ml: computeConsumptionFromScans(scans),
    }))
    .filter(r => r.consumed_ml > 0)
    .sort((a, b) => b.consumed_ml - a.consumed_ml);
}

export interface VarianceReportItem {
  bottle_id: string;
  brand: string;
  theoretical_ml: number;
  actual_ml: number;
  diff_ml: number;
  variance_pct: number;
  flagged: boolean;
}

export async function getVarianceReport(
  barId: string,
  dateStart: string,
  dateEnd: string,
  toastSales: ToastSaleRow[],
  recipes: RecipeWithIngredients[],
  flagThresholdPct: number = 10
): Promise<VarianceReportItem[]> {
  const theoretical = computeTheoreticalUsage(toastSales, recipes);
  const consumption = await getConsumptionReport(barId, dateStart, dateEnd);

  const actualByBottleId: Record<string, { brand: string; consumed_ml: number }> = {};
  for (const c of consumption) {
    actualByBottleId[c.bottle_id] = { brand: c.brand, consumed_ml: c.consumed_ml };
  }

  const allBottleIds = new Set([...Object.keys(theoretical), ...Object.keys(actualByBottleId)]);

  const results: VarianceReportItem[] = [];
  for (const bottleId of allBottleIds) {
    const theoreticalMl = theoretical[bottleId] ?? 0;
    const actualMl = actualByBottleId[bottleId]?.consumed_ml ?? 0;
    const brand = actualByBottleId[bottleId]?.brand ?? bottleId;
    if (theoreticalMl === 0 && actualMl === 0) continue;

    const diffMl = actualMl - theoreticalMl;
    const variancePct = theoreticalMl > 0 ? Math.abs(diffMl / theoreticalMl) * 100 : 100;
    results.push({
      bottle_id: bottleId,
      brand,
      theoretical_ml: Math.round(theoreticalMl),
      actual_ml: Math.round(actualMl),
      diff_ml: Math.round(diffMl),
      variance_pct: Math.round(variancePct * 10) / 10,
      flagged: variancePct > flagThresholdPct,
    });
  }

  return results.sort((a, b) => b.variance_pct - a.variance_pct);
}
