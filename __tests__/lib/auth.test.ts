import { getAppUser } from '@/lib/auth';

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'user-1',
              bar_id: 'bar-1',
              display_name: 'Jennifer',
              role: 'admin',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('getAppUser', () => {
  it('returns user when found', async () => {
    const user = await getAppUser('user-1');
    expect(user).not.toBeNull();
    expect(user?.role).toBe('admin');
    expect(user?.display_name).toBe('Jennifer');
  });
});

describe('getAppUser — not found', () => {
  it('returns null on error', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });
    const user = await getAppUser('bad-id');
    expect(user).toBeNull();
  });
});
