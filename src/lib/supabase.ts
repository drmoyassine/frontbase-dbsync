import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    // In development (or if env vars are missing), this might crash the app 
    // if we strictly require them. For the builder, we often configure this dynamically...
    // BUT for the embedded auth page, we absolutely need these to function.
    console.warn('Missing Supabase URL or Anon Key in environment variables');
}

// Prevent crash if env vars are missing (common in build/dev environments without .env)
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder';

export const supabase = createClient(url, key);
