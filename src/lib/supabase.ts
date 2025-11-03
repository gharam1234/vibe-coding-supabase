import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not defined. Add it to your environment configuration (e.g. .env.local).'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined. Add it to your environment configuration (e.g. .env.local).'
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedClient;
};

export interface Magazine {
  id?: string;
  category: string;
  title: string;
  description: string;
  content: string;
  tags: string[] | null;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}
