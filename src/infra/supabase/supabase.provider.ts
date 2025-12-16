import type { Provider } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE = 'SUPABASE_CLIENT';

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const supabaseProvider: Provider = {
  provide: SUPABASE,
  useFactory: () => {
    const url = requiredEnv('SUPABASE_URL');
    const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    return createClient(url, key, {
      auth: {
        persistSession: false, // Backend only - não precisa persistir sessão
      },
    });
  },
};