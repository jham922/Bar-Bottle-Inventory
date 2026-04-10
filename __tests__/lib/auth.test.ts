import { getAppUser, signIn, signOut, logActivity } from '@/lib/auth';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}));

function getSupabase() {
  return require('@/lib/supabase').supabase as {
    auth: { signInWithPassword: jest.Mock; signOut: jest.Mock };
    from: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── getAppUser ───────────────────────────────────────────────────────────────

describe('getAppUser', () => {
  it('returns user when found', async () => {
    getSupabase().from.mockReturnValue({
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
    });
    const user = await getAppUser('user-1');
    expect(user).not.toBeNull();
    expect(user?.role).toBe('admin');
    expect(user?.display_name).toBe('Jennifer');
  });

  it('returns null on not-found error (PGRST116)', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          }),
        }),
      }),
    });
    const user = await getAppUser('bad-id');
    expect(user).toBeNull();
  });

  it('throws on unexpected errors (network, RLS)', async () => {
    getSupabase().from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: '500', message: 'Internal Server Error' },
          }),
        }),
      }),
    });
    await expect(getAppUser('user-1')).rejects.toMatchObject({ code: '500' });
  });
});

// ── signIn ───────────────────────────────────────────────────────────────────

describe('signIn', () => {
  it('returns data on success', async () => {
    getSupabase().auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    const result = await signIn('a@b.com', 'pass');
    expect(result).toMatchObject({ session: { access_token: 'tok' } });
  });

  it('throws on invalid credentials', async () => {
    getSupabase().auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    await expect(signIn('a@b.com', 'wrong')).rejects.toMatchObject({ message: 'Invalid login credentials' });
  });
});

// ── signOut ──────────────────────────────────────────────────────────────────

describe('signOut', () => {
  it('resolves without error on success', async () => {
    getSupabase().auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('throws on sign-out error', async () => {
    getSupabase().auth.signOut.mockResolvedValue({
      error: { message: 'Sign out failed' },
    });
    await expect(signOut()).rejects.toMatchObject({ message: 'Sign out failed' });
  });
});

// ── logActivity ──────────────────────────────────────────────────────────────

describe('logActivity', () => {
  it('resolves without error on success', async () => {
    getSupabase().from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });
    await expect(logActivity('bar-1', 'user-1', 'scan')).resolves.toBeUndefined();
  });

  it('throws when insert fails', async () => {
    getSupabase().from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    });
    await expect(logActivity('bar-1', 'user-1', 'scan')).rejects.toMatchObject({ message: 'insert failed' });
  });
});
