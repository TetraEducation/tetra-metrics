export const SUPABASE_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

export const isSupabaseEnabled = () =>
  SUPABASE_ENV_VARS.every((name) => Boolean(process.env[name]));
