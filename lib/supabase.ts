import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
export const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjd2JreWRhZWVxY2JkY3hnbmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTcxMjMsImV4cCI6MjA4OTY5MzEyM30.Yy7cTgxrJG38XAW_K0aRLt1UooMAh2kARxWROux7MyI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
