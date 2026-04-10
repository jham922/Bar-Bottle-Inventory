import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getAppUser } from './auth';
import { AppUser } from '@/types/database';

export function useAppUser() {
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          setAppUser(await getAppUser(session.user.id));
        } catch {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return appUser;
}
