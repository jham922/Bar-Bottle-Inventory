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
