import { filterLatestScansPerBottle, aggregateSessionEntries } from '@/lib/history';

describe('filterLatestScansPerBottle', () => {
  it('keeps only the latest scan per bottle when sorted desc', () => {
    const scans = [
      { bottle_id: 'a', scanned_at: '2026-05-12T09:00:00Z', fill_pct: 80 },
      { bottle_id: 'b', scanned_at: '2026-05-12T08:00:00Z', fill_pct: 50 },
      { bottle_id: 'a', scanned_at: '2026-05-11T09:00:00Z', fill_pct: 60 },
    ];
    const result = filterLatestScansPerBottle(scans);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ bottle_id: 'a', fill_pct: 80 });
    expect(result[1]).toMatchObject({ bottle_id: 'b', fill_pct: 50 });
  });

  it('returns empty array for empty input', () => {
    expect(filterLatestScansPerBottle([])).toEqual([]);
  });

  it('returns all rows when all bottle_ids are unique', () => {
    const scans = [
      { bottle_id: 'x', scanned_at: '2026-05-12T09:00:00Z', fill_pct: 40 },
      { bottle_id: 'y', scanned_at: '2026-05-12T08:00:00Z', fill_pct: 70 },
    ];
    expect(filterLatestScansPerBottle(scans)).toHaveLength(2);
  });
});

const makeEntry = (overrides: Partial<{
  id: string; session_id: string; bottle_id: string | null;
  brand: string; spirit_type: string; total_volume_ml: number;
  fill_pct: number; volume_remaining_ml: number; scanned_at: string;
}> = {}) => ({
  id: 'e1', session_id: 's1', bottle_id: 'b1',
  brand: "Maker's Mark", spirit_type: 'Whiskey', total_volume_ml: 750,
  fill_pct: 100, volume_remaining_ml: 750, scanned_at: '2026-05-12T09:00:00Z',
  ...overrides,
});

describe('aggregateSessionEntries', () => {
  it('combines multiple bottles of the same product into a bottle count', () => {
    const entries = [
      makeEntry({ id: 'e1', bottle_id: 'b1', fill_pct: 50, volume_remaining_ml: 375 }),
      makeEntry({ id: 'e2', bottle_id: 'b2', fill_pct: 100, volume_remaining_ml: 750 }),
      makeEntry({ id: 'e3', bottle_id: 'b3', fill_pct: 100, volume_remaining_ml: 750 }),
    ];
    const result = aggregateSessionEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].bottle_count).toBeCloseTo(2.5);
    expect(result[0].volume_remaining_ml).toBe(1875);
    expect(result[0].avg_fill_pct).toBeCloseTo(83.33, 1);
  });

  it('keeps different products as separate rows', () => {
    const entries = [
      makeEntry({ id: 'e1', brand: 'Bulleit', spirit_type: 'Bourbon', fill_pct: 80, volume_remaining_ml: 600 }),
      makeEntry({ id: 'e2', brand: "Hendrick's", spirit_type: 'Gin', fill_pct: 45, volume_remaining_ml: 338 }),
    ];
    const result = aggregateSessionEntries(entries);
    expect(result).toHaveLength(2);
  });

  it('treats same brand in different bottle sizes as separate rows', () => {
    const entries = [
      makeEntry({ id: 'e1', total_volume_ml: 750, fill_pct: 100, volume_remaining_ml: 750 }),
      makeEntry({ id: 'e2', total_volume_ml: 1000, fill_pct: 100, volume_remaining_ml: 1000 }),
    ];
    const result = aggregateSessionEntries(entries);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateSessionEntries([])).toEqual([]);
  });

  it('returns 1.0 for a single full bottle', () => {
    const result = aggregateSessionEntries([makeEntry({ fill_pct: 100, volume_remaining_ml: 750 })]);
    expect(result[0].bottle_count).toBe(1);
  });
});
