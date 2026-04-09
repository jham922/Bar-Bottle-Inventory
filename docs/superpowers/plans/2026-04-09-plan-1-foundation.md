# Bottle Inventory App — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Expo app, provision Supabase, create the full database schema, implement email/password auth, and build team management (invite, roles, activity log) so Plans 2 and 3 have a working foundation.

**Architecture:** Expo Router (file-based routing) for iOS/Android/web from one codebase. Supabase handles auth, Postgres, and storage. Row-Level Security (RLS) policies enforce role-based access at the database layer so the client never needs to filter by role manually.

**Tech Stack:** Expo SDK 52, Expo Router v4, React Native, TypeScript, Supabase JS client v2, Supabase CLI (for migrations), Jest + React Native Testing Library

---

## File Structure

```
app/
  _layout.tsx                  # Root layout, auth gate
  (auth)/
    login.tsx                  # Login screen
    accept-invite.tsx          # Staff invite acceptance screen
  (app)/
    _layout.tsx                # Tab layout (admin sees all tabs, staff sees 2)
    index.tsx                  # Dashboard home
    inventory/
      index.tsx                # Inventory list (placeholder for Plan 2)
    scan/
      index.tsx                # Scan entry (placeholder for Plan 2)
    reports/
      index.tsx                # Reports (placeholder for Plan 3)
    settings/
      index.tsx                # Settings root
      team.tsx                 # Team management screen
      invite.tsx               # Invite staff screen

lib/
  supabase.ts                  # Supabase client singleton
  auth.ts                      # Auth helpers (signIn, signOut, getSession)

types/
  database.ts                  # TypeScript types mirroring DB schema
  auth.ts                      # User / role types

supabase/
  migrations/
    001_initial_schema.sql     # All tables + RLS policies
  seed.sql                     # Dev seed data

__tests__/
  lib/
    auth.test.ts
  components/
    (empty for Plan 1)
```

---

## Task 1: Initialize Expo Project

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/(auth)/login.tsx`
- Create: `app/(app)/_layout.tsx`
- Create: `app/(app)/index.tsx`

- [ ] **Step 1: Create the Expo project**

```bash
npx create-expo-app@latest Bar-Bottle-Inventory --template tabs
cd Bar-Bottle-Inventory
```

- [ ] **Step 2: Install dependencies**

```bash
npx expo install expo-camera expo-image-picker
npx expo install @supabase/supabase-js
npx expo install react-native-url-polyfill
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native
```

- [ ] **Step 3: Configure TypeScript strict mode**

In `tsconfig.json`, ensure:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 4: Configure Jest**

Create `jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

- [ ] **Step 5: Add npm test script**

In `package.json`, ensure scripts includes:
```json
"test": "jest --watchAll=false",
"test:watch": "jest --watchAll"
```

- [ ] **Step 6: Verify project starts**

```bash
npx expo start --web
```
Expected: Expo dev server starts, browser opens to default tab layout.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: initialize Expo project with dependencies"
```

---

## Task 2: Supabase Project + Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `lib/supabase.ts`
- Create: `types/database.ts`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com, create a new project named `bar-bottle-inventory`. Save:
- Project URL → `EXPO_PUBLIC_SUPABASE_URL`
- Anon public key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Create `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 2: Install Supabase CLI and link project**

```bash
npm install --save-dev supabase
npx supabase login
npx supabase init
npx supabase link --project-ref your-project-ref
```

- [ ] **Step 3: Write migration**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Bar (single row, all users belong to one bar)
create table bar (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  bar_id uuid references bar(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

-- Bottles catalog
create table bottles (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  brand text not null,
  spirit_type text not null,
  total_volume_ml numeric not null,
  bottle_image_ref text,
  created_at timestamptz default now()
);

-- Inventory scans
create table inventory_scans (
  id uuid primary key default uuid_generate_v4(),
  bottle_id uuid not null references bottles(id) on delete cascade,
  fill_pct numeric not null check (fill_pct >= 0 and fill_pct <= 100),
  volume_remaining_ml numeric not null,
  scan_image_url text,
  scanned_by uuid not null references users(id),
  scanned_at timestamptz default now()
);

-- Alerts
create table alerts (
  id uuid primary key default uuid_generate_v4(),
  bottle_id uuid not null references bottles(id) on delete cascade,
  threshold_ml numeric not null,
  triggered_at timestamptz default now(),
  resolved_at timestamptz
);

-- Recipes
create table recipes (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  name text not null,
  toast_menu_item_name text,
  created_at timestamptz default now()
);

-- Recipe ingredients
create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  bottle_id uuid references bottles(id) on delete set null,
  ingredient_name text not null,
  quantity_oz numeric not null,
  tracked boolean not null default true
);

-- Toast uploads
create table toast_uploads (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  date_range_start date not null,
  date_range_end date not null,
  uploaded_at timestamptz default now()
);

-- Toast sales
create table toast_sales (
  id uuid primary key default uuid_generate_v4(),
  upload_id uuid not null references toast_uploads(id) on delete cascade,
  recipe_id uuid references recipes(id) on delete set null,
  menu_item_name text not null,
  units_sold integer not null
);

-- Activity log
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  created_at timestamptz default now()
);

-- Pending invites
create table invites (
  id uuid primary key default uuid_generate_v4(),
  bar_id uuid not null references bar(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  invited_by uuid not null references users(id),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  accepted_at timestamptz
);

-- =========================================
-- Row Level Security
-- =========================================

alter table bar enable row level security;
alter table users enable row level security;
alter table bottles enable row level security;
alter table inventory_scans enable row level security;
alter table alerts enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table toast_uploads enable row level security;
alter table toast_sales enable row level security;
alter table activity_log enable row level security;
alter table invites enable row level security;

-- Helper: get current user's bar_id
create or replace function current_bar_id()
returns uuid language sql security definer stable as $$
  select bar_id from users where id = auth.uid();
$$;

-- Helper: get current user's role
create or replace function current_user_role()
returns text language sql security definer stable as $$
  select role from users where id = auth.uid();
$$;

-- bar: users can read their own bar
create policy "bar: read own" on bar for select
  using (id = current_bar_id());

-- users: read all in same bar
create policy "users: read same bar" on users for select
  using (bar_id = current_bar_id());

-- users: admin can update roles
create policy "users: admin update" on users for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- bottles: all in same bar can read; only admin can insert/update/delete
create policy "bottles: read same bar" on bottles for select
  using (bar_id = current_bar_id());
create policy "bottles: admin write" on bottles for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "bottles: admin update" on bottles for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- inventory_scans: all in same bar can read and insert
create policy "scans: read same bar" on inventory_scans for select
  using (bottle_id in (select id from bottles where bar_id = current_bar_id()));
create policy "scans: any insert" on inventory_scans for insert
  with check (bottle_id in (select id from bottles where bar_id = current_bar_id()));

-- alerts: all read, admin write
create policy "alerts: read same bar" on alerts for select
  using (bottle_id in (select id from bottles where bar_id = current_bar_id()));
create policy "alerts: admin write" on alerts for insert
  with check (current_user_role() = 'admin');
create policy "alerts: admin update" on alerts for update
  using (current_user_role() = 'admin');

-- recipes: all read, admin write
create policy "recipes: read same bar" on recipes for select
  using (bar_id = current_bar_id());
create policy "recipes: admin write" on recipes for insert
  with check (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "recipes: admin update" on recipes for update
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "recipes: admin delete" on recipes for delete
  using (current_user_role() = 'admin' and bar_id = current_bar_id());

-- recipe_ingredients: follow recipe access
create policy "recipe_ingredients: read" on recipe_ingredients for select
  using (recipe_id in (select id from recipes where bar_id = current_bar_id()));
create policy "recipe_ingredients: admin write" on recipe_ingredients for insert
  with check (current_user_role() = 'admin');
create policy "recipe_ingredients: admin update" on recipe_ingredients for update
  using (current_user_role() = 'admin');
create policy "recipe_ingredients: admin delete" on recipe_ingredients for delete
  using (current_user_role() = 'admin');

-- toast_uploads / toast_sales: admin only
create policy "toast_uploads: admin" on toast_uploads for all
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "toast_sales: admin" on toast_sales for all
  using (upload_id in (select id from toast_uploads where bar_id = current_bar_id()) and current_user_role() = 'admin');

-- activity_log: admin read, any insert
create policy "activity_log: admin read" on activity_log for select
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
create policy "activity_log: any insert" on activity_log for insert
  with check (bar_id = current_bar_id());

-- invites: admin manage
create policy "invites: admin" on invites for all
  using (current_user_role() = 'admin' and bar_id = current_bar_id());
```

- [ ] **Step 4: Push migration**

```bash
npx supabase db push
```
Expected: migration applies with no errors.

- [ ] **Step 5: Write seed data**

Create `supabase/seed.sql`:
```sql
-- Insert a bar
insert into bar (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'The Rusty Nail');
```

- [ ] **Step 6: Create Supabase client**

Create `lib/supabase.ts`:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
```

Install AsyncStorage:
```bash
npx expo install @react-native-async-storage/async-storage
```

- [ ] **Step 7: Write TypeScript types**

Create `types/database.ts`:
```ts
export type Role = 'admin' | 'staff';

export interface Bar {
  id: string;
  name: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  bar_id: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface Bottle {
  id: string;
  bar_id: string;
  brand: string;
  spirit_type: string;
  total_volume_ml: number;
  bottle_image_ref: string | null;
  created_at: string;
}

export interface InventoryScan {
  id: string;
  bottle_id: string;
  fill_pct: number;
  volume_remaining_ml: number;
  scan_image_url: string | null;
  scanned_by: string;
  scanned_at: string;
}

export interface Alert {
  id: string;
  bottle_id: string;
  threshold_ml: number;
  triggered_at: string;
  resolved_at: string | null;
}

export interface Recipe {
  id: string;
  bar_id: string;
  name: string;
  toast_menu_item_name: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  bottle_id: string | null;
  ingredient_name: string;
  quantity_oz: number;
  tracked: boolean;
}

export interface ToastUpload {
  id: string;
  bar_id: string;
  uploaded_by: string;
  date_range_start: string;
  date_range_end: string;
  uploaded_at: string;
}

export interface ToastSale {
  id: string;
  upload_id: string;
  recipe_id: string | null;
  menu_item_name: string;
  units_sold: number;
}

export interface ActivityLog {
  id: string;
  bar_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface Invite {
  id: string;
  bar_id: string;
  email: string;
  role: Role;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
}
```

- [ ] **Step 8: Commit**

```bash
git add supabase/ lib/supabase.ts types/database.ts .env.local .gitignore
git commit -m "feat: Supabase schema, RLS policies, client, and types"
```

---

## Task 3: Auth — Sign In & Session

**Files:**
- Create: `lib/auth.ts`
- Create: `types/auth.ts`
- Create: `app/_layout.tsx`
- Create: `app/(auth)/login.tsx`
- Create: `__tests__/lib/auth.test.ts`

- [ ] **Step 1: Write auth types**

Create `types/auth.ts`:
```ts
import { AppUser } from './database';

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
}
```

- [ ] **Step 2: Write auth helpers**

Create `lib/auth.ts`:
```ts
import { supabase } from './supabase';
import { AppUser } from '@/types/database';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAppUser(userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as AppUser;
}

export async function logActivity(
  barId: string,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string
) {
  await supabase.from('activity_log').insert({
    bar_id: barId,
    user_id: userId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
  });
}
```

- [ ] **Step 3: Write failing tests**

Create `__tests__/lib/auth.test.ts`:
```ts
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
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
npm test -- __tests__/lib/auth.test.ts
```
Expected: FAIL — module not found errors (lib/auth.ts doesn't exist yet at test time — if you created it in step 2, they should pass; if not, fail is expected).

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- __tests__/lib/auth.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 6: Build root layout with auth gate**

Replace `app/_layout.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getAppUser } from '@/lib/auth';
import { AppUser } from '@/types/database';

export default function RootLayout() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await getAppUser(session.user.id);
        setUser(appUser);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const appUser = await getAppUser(session.user.id);
        setUser(appUser);
      } else {
        setUser(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [user, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 7: Build login screen**

Create `app/(auth)/login.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bar Inventory</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Pressable style={styles.button} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 32, textAlign: 'center' },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
```

- [ ] **Step 8: Verify login flow manually**

```bash
npx expo start --web
```
- Open browser, confirm redirect to `/login`
- Sign in with a Supabase test user (create one in Supabase dashboard → Auth → Users)
- Confirm redirect to `/(app)` after sign in

- [ ] **Step 9: Commit**

```bash
git add app/ lib/auth.ts types/auth.ts __tests__/
git commit -m "feat: auth gate, login screen, session management"
```

---

## Task 4: App Shell — Tabs & Role-Gated Navigation

**Files:**
- Create: `app/(app)/_layout.tsx`
- Create: `app/(app)/index.tsx`
- Create: `app/(app)/inventory/index.tsx`
- Create: `app/(app)/scan/index.tsx`
- Create: `app/(app)/reports/index.tsx`
- Create: `app/(app)/settings/index.tsx`
- Create: `lib/useAppUser.ts`

- [ ] **Step 1: Create user context hook**

Create `lib/useAppUser.ts`:
```ts
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getAppUser } from './auth';
import { AppUser } from '@/types/database';

export function useAppUser() {
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setAppUser(await getAppUser(session.user.id));
      }
    });
  }, []);

  return appUser;
}
```

- [ ] **Step 2: Build tab layout with role-gating**

Create `app/(app)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';

export default function AppLayout() {
  const user = useAppUser();
  const isAdmin = user?.role === 'admin';

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' }, tabBarActiveTintColor: '#fff', tabBarInactiveTintColor: '#666' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="scan/index" options={{ title: 'Scan' }} />
      <Tabs.Screen name="inventory/index" options={{ title: 'Inventory' }} />
      <Tabs.Screen
        name="reports/index"
        options={{ title: 'Reports', href: isAdmin ? undefined : null }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{ title: 'Settings', href: isAdmin ? undefined : null }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 3: Build placeholder screens**

Create `app/(app)/index.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native';
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Dashboard — coming in Plan 2</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 16 },
});
```

Create `app/(app)/scan/index.tsx` with the same pattern, text: `"Scan — coming in Plan 2"`.

Create `app/(app)/inventory/index.tsx` with text: `"Inventory — coming in Plan 2"`.

Create `app/(app)/reports/index.tsx` with text: `"Reports — coming in Plan 3"`.

Create `app/(app)/settings/index.tsx` with text: `"Settings"`.

- [ ] **Step 4: Verify tabs render correctly**

```bash
npx expo start --web
```
Sign in as admin — confirm all 5 tabs visible. Sign in as staff user — confirm Reports and Settings tabs are hidden.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/ lib/useAppUser.ts
git commit -m "feat: tab shell with role-gated navigation"
```

---

## Task 5: Team Management — View Team & Change Roles

**Files:**
- Create: `app/(app)/settings/team.tsx`
- Create: `lib/team.ts`
- Create: `__tests__/lib/team.test.ts`

- [ ] **Step 1: Write failing test for team queries**

Create `__tests__/lib/team.test.ts`:
```ts
import { getTeamMembers, updateUserRole } from '@/lib/team';

const mockUsers = [
  { id: 'u1', bar_id: 'b1', display_name: 'Jennifer', role: 'admin', created_at: '2026-01-01' },
  { id: 'u2', bar_id: 'b1', display_name: 'Sarah', role: 'staff', created_at: '2026-01-02' },
];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: mockUsers, error: null }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

describe('getTeamMembers', () => {
  it('returns all users for the bar', async () => {
    const members = await getTeamMembers('b1');
    expect(members).toHaveLength(2);
    expect(members[0].display_name).toBe('Jennifer');
  });
});

describe('updateUserRole', () => {
  it('calls update without throwing', async () => {
    await expect(updateUserRole('u2', 'admin')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/team.test.ts
```
Expected: FAIL — `getTeamMembers` is not defined.

- [ ] **Step 3: Implement team helpers**

Create `lib/team.ts`:
```ts
import { supabase } from './supabase';
import { AppUser, Role } from '@/types/database';

export async function getTeamMembers(barId: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('bar_id', barId);
  if (error) throw error;
  return data as AppUser[];
}

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

export async function removeUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/team.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Build team screen**

Create `app/(app)/settings/team.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getTeamMembers, updateUserRole, removeUser } from '@/lib/team';
import { useAppUser } from '@/lib/useAppUser';
import { AppUser, Role } from '@/types/database';

export default function TeamScreen() {
  const currentUser = useAppUser();
  const router = useRouter();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.bar_id) return;
    getTeamMembers(currentUser.bar_id)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [currentUser]);

  function toggleRole(member: AppUser) {
    if (member.id === currentUser?.id) return;
    const newRole: Role = member.role === 'admin' ? 'staff' : 'admin';
    Alert.alert('Change role', `Set ${member.display_name} to ${newRole}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await updateUserRole(member.id, newRole);
          setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
        },
      },
    ]);
  }

  function handleRemove(member: AppUser) {
    if (member.id === currentUser?.id) return;
    Alert.alert('Remove member', `Remove ${member.display_name} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeUser(member.id);
          setMembers(prev => prev.filter(m => m.id !== member.id));
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fff" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <Pressable onPress={() => router.push('/(app)/settings/invite')} style={styles.inviteBtn}>
          <Text style={styles.inviteBtnText}>+ Invite</Text>
        </Pressable>
      </View>
      <FlatList
        data={members}
        keyExtractor={m => m.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>{item.display_name}</Text>
              <Pressable onPress={() => toggleRole(item)}>
                <Text style={styles.role}>{item.role === 'admin' ? 'Admin' : 'Staff'} — tap to toggle</Text>
              </Pressable>
            </View>
            {item.id !== currentUser?.id && (
              <Pressable onPress={() => handleRemove(item)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inviteBtn: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  inviteBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  name: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  role: { color: '#888', fontSize: 12, marginTop: 2 },
  remove: { color: '#cc6666', fontSize: 13 },
});
```

- [ ] **Step 6: Add team link to settings screen**

Replace `app/(app)/settings/index.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from '@/lib/auth';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Pressable style={styles.row} onPress={() => router.push('/(app)/settings/team')}>
        <Text style={styles.rowText}>Team Management</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={signOut}>
        <Text style={[styles.rowText, { color: '#cc6666' }]}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', padding: 20 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  rowText: { color: '#fff', fontSize: 16 },
});
```

- [ ] **Step 7: Commit**

```bash
git add app/(app)/settings/ lib/team.ts __tests__/lib/team.test.ts
git commit -m "feat: team management — view members, toggle roles, remove"
```

---

## Task 6: Invite Flow

**Files:**
- Create: `app/(app)/settings/invite.tsx`
- Create: `app/(auth)/accept-invite.tsx`
- Create: `lib/invites.ts`
- Create: `__tests__/lib/invites.test.ts`
- Create: `supabase/functions/send-invite/index.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/invites.test.ts`:
```ts
import { createInvite, getPendingInvites } from '@/lib/invites';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'inv-1', email: 'alex@bar.com', token: 'abc123', expires_at: '2026-04-11T00:00:00Z' },
            error: null,
          }),
        }),
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({
            data: [{ id: 'inv-1', email: 'alex@bar.com', accepted_at: null }],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('createInvite', () => {
  it('returns invite with token', async () => {
    const invite = await createInvite('b1', 'u1', 'alex@bar.com', 'staff');
    expect(invite.token).toBe('abc123');
    expect(invite.email).toBe('alex@bar.com');
  });
});

describe('getPendingInvites', () => {
  it('returns uninvites with no accepted_at', async () => {
    const invites = await getPendingInvites('b1');
    expect(invites).toHaveLength(1);
    expect(invites[0].accepted_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/invites.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement invite helpers**

Create `lib/invites.ts`:
```ts
import { supabase } from './supabase';
import { Invite, Role } from '@/types/database';

export async function createInvite(
  barId: string,
  invitedBy: string,
  email: string,
  role: Role
): Promise<Invite> {
  const { data, error } = await supabase
    .from('invites')
    .insert({ bar_id: barId, invited_by: invitedBy, email, role })
    .select()
    .single();
  if (error) throw error;
  return data as Invite;
}

export async function getPendingInvites(barId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('bar_id', barId)
    .is('accepted_at', null);
  if (error) throw error;
  return data as Invite[];
}

export async function acceptInvite(token: string, displayName: string, password: string): Promise<void> {
  // 1. Look up the invite
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single();
  if (inviteError || !invite) throw new Error('Invalid or expired invite link.');
  if (new Date(invite.expires_at) < new Date()) throw new Error('This invite has expired.');

  // 2. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: invite.email,
    password,
  });
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('User creation failed.');

  // 3. Create users row
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    bar_id: invite.bar_id,
    display_name: displayName,
    role: invite.role,
  });
  if (userError) throw userError;

  // 4. Mark invite accepted
  await supabase.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/invites.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Build invite screen**

Create `app/(app)/settings/invite.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { createInvite } from '@/lib/invites';
import { useAppUser } from '@/lib/useAppUser';
import { logActivity } from '@/lib/auth';

export default function InviteScreen() {
  const currentUser = useAppUser();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    if (!email.trim() || !currentUser) return;
    setLoading(true);
    try {
      const invite = await createInvite(currentUser.bar_id, currentUser.id, email.trim(), 'staff');
      await logActivity(currentUser.bar_id, currentUser.id, `Invited ${email.trim()}`, 'invite', invite.id);
      Alert.alert('Invite sent', `An invite link has been sent to ${email.trim()}. It expires in 48 hours.`);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite Staff</Text>
      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="staff@yourbar.com"
        placeholderTextColor="#666"
      />
      <Text style={styles.note}>They'll receive an email with a sign-up link valid for 48 hours. They'll be added as Staff.</Text>
      <Pressable style={styles.button} onPress={handleInvite} disabled={loading || !email.trim()}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Send Invite</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 24, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { color: '#888', fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 12 },
  note: { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 24 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
```

- [ ] **Step 6: Build accept-invite screen**

Create `app/(auth)/accept-invite.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { acceptInvite } from '@/lib/invites';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!token || !displayName.trim() || !password) return;
    setLoading(true);
    try {
      await acceptInvite(token, displayName.trim(), password);
      Alert.alert('Welcome!', 'Your account has been created. You are now signed in.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Account</Text>
      <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#666" value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Choose a password" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.button} onPress={handleAccept} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
```

**Note on email delivery:** Supabase does not send invite emails automatically — the invite token lives in the `invites` table. For production, configure a Supabase Edge Function or use Resend/SendGrid to email the link `https://yourapp.com/(auth)/accept-invite?token=<token>` when an invite is created. For now, the invite link can be shared manually (copy the token from the dashboard).

- [ ] **Step 7: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/(auth)/accept-invite.tsx app/(app)/settings/invite.tsx lib/invites.ts __tests__/lib/invites.test.ts
git commit -m "feat: invite flow — create invite, accept invite screen"
```

---

## Task 7: Activity Log — Admin Feed

**Files:**
- Modify: `app/(app)/index.tsx`
- Create: `lib/activity.ts`
- Create: `__tests__/lib/activity.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/lib/activity.test.ts`:
```ts
import { getRecentActivity } from '@/lib/activity';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
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
    }),
  },
}));

describe('getRecentActivity', () => {
  it('returns activity with user display names', async () => {
    const items = await getRecentActivity('b1');
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe('Scanned 3 bottles');
    expect(items[0].users.display_name).toBe('Sarah');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/activity.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement activity helper**

Create `lib/activity.ts`:
```ts
import { supabase } from './supabase';

export interface ActivityItem {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  users: { display_name: string } | null;
}

export async function getRecentActivity(barId: string, limit = 20): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, user_id, created_at, users(display_name)')
    .eq('bar_id', barId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as ActivityItem[];
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/activity.test.ts
```
Expected: PASS.

- [ ] **Step 5: Build dashboard home screen**

Replace `app/(app)/index.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getRecentActivity, ActivityItem } from '@/lib/activity';
import { signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface DashboardStats {
  totalBottles: number;
  lowStockCount: number;
  spiritTypeCount: number;
  lastScanAt: string | null;
}

async function getDashboardStats(barId: string): Promise<DashboardStats> {
  const [bottlesRes, alertsRes, scansRes] = await Promise.all([
    supabase.from('bottles').select('id, spirit_type').eq('bar_id', barId),
    supabase.from('alerts').select('id', { count: 'exact' }).is('resolved_at', null),
    supabase.from('inventory_scans')
      .select('scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1),
  ]);

  const bottles = bottlesRes.data ?? [];
  const spiritTypes = new Set(bottles.map((b: any) => b.spirit_type)).size;

  return {
    totalBottles: bottles.length,
    lowStockCount: alertsRes.count ?? 0,
    spiritTypeCount: spiritTypes,
    lastScanAt: scansRes.data?.[0]?.scanned_at ?? null,
  };
}

export default function HomeScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user?.bar_id) return;
    getDashboardStats(user.bar_id).then(setStats);
    if (isAdmin) getRecentActivity(user.bar_id).then(setActivity);
  }, [user]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.barName}>Bar Inventory</Text>
        <Text style={styles.userName}>{user?.display_name}</Text>
      </View>

      {stats ? (
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.totalBottles}</Text>
            <Text style={styles.statLabel}>Total Bottles</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.lowStockCount}</Text>
            <Text style={styles.statLabel}>⚠️ Low Stock</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.spiritTypeCount}</Text>
            <Text style={styles.statLabel}>Spirit Types</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleDateString() : '—'}</Text>
            <Text style={styles.statLabel}>Last Scan</Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
      )}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => router.push('/(app)/scan/index')}>
          <Text style={styles.actionBtnText}>📷 Scan</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/(app)/inventory/index')}>
          <Text style={[styles.actionBtnText, { color: '#ddd' }]}>📋 Inventory</Text>
        </Pressable>
        {isAdmin && (
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/(app)/reports/index')}>
            <Text style={[styles.actionBtnText, { color: '#ddd' }]}>📊 Report</Text>
          </Pressable>
        )}
      </View>

      {isAdmin && activity.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {activity.slice(0, 8).map(item => (
            <View key={item.id} style={styles.activityRow}>
              <Text style={styles.activityText}>
                {item.users?.display_name ?? 'Someone'}: {item.action}
              </Text>
              <Text style={styles.activityTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  barName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  userName: { color: '#888', fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, gap: 1, backgroundColor: '#222', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  statCell: { width: '50%', backgroundColor: '#1a1a1a', padding: 16, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 24 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, alignItems: 'center' },
  actionBtnSecondary: { backgroundColor: '#222' },
  actionBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  section: { paddingHorizontal: 16 },
  sectionTitle: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  activityText: { color: '#ccc', fontSize: 13, flex: 1, marginRight: 8 },
  activityTime: { color: '#555', fontSize: 12 },
});
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/(app)/index.tsx lib/activity.ts __tests__/lib/activity.test.ts
git commit -m "feat: dashboard with stats and admin activity feed"
```

---

## Task 8: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify on GitHub**

Open https://github.com/jham922/Bar-Bottle-Inventory — confirm all commits are visible.

---

## Plan 1 Complete

After Task 8, the app has:
- Working Expo app on iOS, Android, and web
- Full Supabase schema with RLS
- Email/password login with role-based nav
- Team management (view, toggle roles, remove, invite)
- Activity log visible to admins
- Dashboard home with live stats

**Next:** Plan 2 covers camera integration, Claude Vision AI scanning, the bottle catalog, inventory list, and low-stock alerts.
