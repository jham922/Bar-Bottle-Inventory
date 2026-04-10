import { getTeamMembers, updateUserRole } from '@/lib/team';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const getSupabase = () => require('@/lib/supabase').supabase;

const mockUsers = [
  { id: 'u1', bar_id: 'b1', display_name: 'Jennifer', role: 'admin', created_at: '2026-01-01' },
  { id: 'u2', bar_id: 'b1', display_name: 'Sarah', role: 'staff', created_at: '2026-01-02' },
];

describe('getTeamMembers', () => {
  it('returns all users for the bar', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: mockUsers, error: null }),
      }),
    });
    const members = await getTeamMembers('b1');
    expect(members).toHaveLength(2);
    expect(members[0].display_name).toBe('Jennifer');
  });
});

describe('updateUserRole', () => {
  it('calls update without throwing', async () => {
    getSupabase().from.mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    await expect(updateUserRole('u2', 'admin')).resolves.toBeUndefined();
  });
});
