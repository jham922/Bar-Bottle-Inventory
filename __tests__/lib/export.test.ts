import { buildInventoryCsv, buildConsumptionCsv, buildVarianceCsv, buildHistoryCsv } from '@/lib/export';

jest.mock('expo-print', () => ({}));

describe('buildInventoryCsv', () => {
  it('produces correct CSV headers and rows', () => {
    const items = [{ brand: 'Bulleit', spirit_type: 'Bourbon', total_volume_ml: 750, fill_pct: 55, volume_remaining_ml: 413, scanned_at: '2026-04-09' }];
    const csv = buildInventoryCsv(items as any);
    expect(csv).toContain('Brand,Spirit Type,Bottle Size (ml),Fill %,Remaining (ml),Last Scanned');
    expect(csv).toContain('Bulleit,Bourbon,750,55,413');
  });
});

describe('buildVarianceCsv', () => {
  it('includes flagged column', () => {
    const items = [{ brand: 'Campari', theoretical_ml: 1390, actual_ml: 1640, diff_ml: 250, variance_pct: 18, flagged: true }];
    const csv = buildVarianceCsv(items as any, '2026-04-01', '2026-04-07');
    expect(csv).toContain('Flagged');
    expect(csv).toContain('YES');
  });
});

describe('buildHistoryCsv', () => {
  it('includes header line with submitted date and aggregated column headers', () => {
    const entries: any[] = [];
    const csv = buildHistoryCsv(entries, '2026-05-12T21:14:00.000Z');
    expect(csv).toContain('Inventory Count:');
    expect(csv).toContain('Brand,Spirit Type,Bottle Size (ml),Bottles,Remaining (ml)');
  });

  it('formats aggregated bottle count and total remaining ml', () => {
    const entries: any[] = [
      {
        brand: "Maker's Mark",
        spirit_type: 'Whiskey',
        total_volume_ml: 750,
        bottle_count: 2.5,
        volume_remaining_ml: 1875,
        avg_fill_pct: 83.33,
      },
    ];
    const csv = buildHistoryCsv(entries, '2026-05-12T21:14:00.000Z');
    expect(csv).toContain("Maker's Mark,Whiskey,750,2.5,1875");
  });
});
