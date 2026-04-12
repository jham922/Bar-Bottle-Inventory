import { analyzeBottleImage } from '@/lib/scan';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

describe('analyzeBottleImage — single mode', () => {
  it('returns parsed scan result', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: { brand: 'Bulleit', spirit_type: 'Bourbon', fill_pct: 55, confidence: 'high', known_bottle: true },
      }),
    });

    const result = await analyzeBottleImage('base64data==', 'single');
    expect((result as any).brand).toBe('Bulleit');
    expect((result as any).fill_pct).toBe(55);
    expect((result as any).known_bottle).toBe(true);
  });

  it('throws when ok is false', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: false, error: 'Failed to parse' }),
    });
    await expect(analyzeBottleImage('bad', 'single')).rejects.toThrow('Failed to parse');
  });
});
