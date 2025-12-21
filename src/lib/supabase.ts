import { createClient } from '@supabase/supabase-js';

// Check for runtime config (injected by server) or build-time config (Vite)
const runtimeEnv = (window as any).__FRONTBASE_ENV__ || {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Prevent crash if env vars are missing (common in build/dev environments without .env)
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder';

export const supabase = createClient(url, key);
