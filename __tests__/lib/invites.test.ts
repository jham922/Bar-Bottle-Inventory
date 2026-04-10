import { createInvite, getPendingInvites } from '@/lib/invites';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const getSupabase = () => require('@/lib/supabase').supabase;

describe('createInvite', () => {
  it('returns invite with token', async () => {
    getSupabase().from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'inv-1', email: 'alex@bar.com', token: 'abc123', expires_at: '2026-04-11T00:00:00Z' },
            error: null,
          }),
        }),
      }),
    });
    const invite = await createInvite('b1', 'u1', 'alex@bar.com', 'staff');
    expect(invite.token).toBe('abc123');
    expect(invite.email).toBe('alex@bar.com');
  });
});

describe('getPendingInvites', () => {
  it('returns invites with no accepted_at', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({
            data: [{ id: 'inv-1', email: 'alex@bar.com', accepted_at: null }],
            error: null,
          }),
        }),
      }),
    });
    const invites = await getPendingInvites('b1');
    expect(invites).toHaveLength(1);
    expect(invites[0].accepted_at).toBeNull();
  });
});
