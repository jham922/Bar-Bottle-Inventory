import { getRecentActivity } from '@/lib/activity';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const getSupabase = () => require('@/lib/supabase').supabase;

describe('getRecentActivity', () => {
  it('returns activity with user display names', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                { id: 'a1', action: 'Scanned 3 bottles', user_id: 'u1', created_at: '2026-04-09T10:00:00Z', users: { display_name: 'Sarah' } },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });
    const items = await getRecentActivity('b1');
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe('Scanned 3 bottles');
    expect(items[0].users.display_name).toBe('Sarah');
  });
});
