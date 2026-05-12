import { filterLatestScansPerBottle } from '@/lib/history';

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
