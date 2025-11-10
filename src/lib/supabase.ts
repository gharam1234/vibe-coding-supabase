import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedServiceClient: SupabaseClient | null = null;

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

export const getSupabaseServiceRoleClient = (): SupabaseClient => {
  if (cachedServiceClient) {
    return cachedServiceClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL) 환경 변수를 설정하세요.'
    );
  }

  if (!supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 환경 변수를 설정하세요.'
    );
  }

  cachedServiceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedServiceClient;
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
