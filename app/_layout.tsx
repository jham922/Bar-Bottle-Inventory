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
    let cancelled = false;

    // Resolve initial session immediately so refresh never shows a blank screen
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        try {
          const appUser = await getAppUser(session.user.id);
          if (!cancelled) setUser(appUser);
        } catch {
          if (!cancelled) setUser(null);
        }
      } else {
        if (!cancelled) setUser(null);
      }
      if (!cancelled) setLoading(false);
    });

    // Keep listening for sign-in / sign-out events
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          const appUser = await getAppUser(session.user.id);
          setUser(appUser);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [user, loading, segments, router]);

  if (loading) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
