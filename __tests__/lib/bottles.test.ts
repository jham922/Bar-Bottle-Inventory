import { findBottleByBrand, createBottle, saveInventoryScan } from '@/lib/bottles';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const getSupabase = () => require('@/lib/supabase').supabase;

const mockBottle = { id: 'b1', bar_id: 'bar1', brand: 'Bulleit', spirit_type: 'Bourbon', total_volume_ml: 750, bottle_image_ref: null, created_at: '2026-01-01' };
const mockScan = { id: 's1', bottle_id: 'b1', fill_pct: 55, volume_remaining_ml: 413, scan_image_url: null, scanned_by: 'u1', scanned_at: '2026-04-09' };

describe('findBottleByBrand', () => {
  it('returns bottle when brand matches', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockBottle, error: null }),
          }),
        }),
      }),
    });
    const bottle = await findBottleByBrand('bar1', 'Bulleit');
    expect(bottle?.brand).toBe('Bulleit');
  });
});

describe('createBottle', () => {
  it('creates and returns new bottle', async () => {
    getSupabase().from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBottle, error: null }),
        }),
      }),
    });
    const bottle = await createBottle('bar1', 'Bulleit', 'Bourbon', 750);
    expect(bottle.id).toBe('b1');
    expect(bottle.total_volume_ml).toBe(750);
  });
});

describe('saveInventoryScan', () => {
  it('saves scan record', async () => {
    getSupabase().from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockScan, error: null }),
        }),
      }),
    });
    const scan = await saveInventoryScan('b1', 55, 413, 'u1');
    expect(scan.fill_pct).toBe(55);
    expect(scan.volume_remaining_ml).toBe(413);
  });
});
