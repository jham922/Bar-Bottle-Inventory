import { getConsumptionReport } from '@/lib/reports';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'inventory_scans') {
        return {
          select: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [
                    { bottle_id: 'b1', volume_remaining_ml: 750, scanned_at: '2026-04-01T10:00:00Z', bottles: { brand: 'Bulleit', spirit_type: 'Bourbon', bar_id: 'bar1' } },
                    { bottle_id: 'b1', volume_remaining_ml: 413, scanned_at: '2026-04-07T10:00:00Z', bottles: { brand: 'Bulleit', spirit_type: 'Bourbon', bar_id: 'bar1' } },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }) }) };
    }),
  },
}));

describe('getConsumptionReport', () => {
  it('calculates ml consumed per bottle', async () => {
    const report = await getConsumptionReport('bar1', '2026-04-01', '2026-04-07');
    expect(report).toHaveLength(1);
    expect(report[0].brand).toBe('Bulleit');
    expect(report[0].consumed_ml).toBe(337); // 750 - 413
  });
});
