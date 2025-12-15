import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { AuthTokenValidatorPort } from '@/modules/iam/application/ports/auth-token-validator.port';
import type { AuthenticatedUser } from '@/modules/iam/domain/authenticated-user';

@Injectable()
export class SupabaseAuthService implements AuthTokenValidatorPort {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async validate(token: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data?.user) return null;

    return {
      id: data.user.id,
      email: data.user.email ?? null,
      raw: data.user,
    };
  }
}

