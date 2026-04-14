import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wqxuuqnmnuaokvmccpjt.supabase.co').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxeHV1cW5tbnVhb2t2bWNjcGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTE5NzgsImV4cCI6MjA5MTI2Nzk3OH0.Vt7YoekttZd_8M6VdIYyTP69fx97Wu1X4ZyWcRmw2Sk').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
