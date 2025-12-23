import { Module } from '@nestjs/common';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { AUTH_TOKEN_VALIDATOR } from '@/modules/iam/application/ports/auth-token-validator.port';
import { SupabaseAuthGuard } from '@/modules/iam/interface/http/guards/supabase.auth.guard';
import { SupabaseAuthService } from '@/modules/iam/infra/supabase/supabase-auth.service';

const authTokenValidatorProvider = {
  provide: AUTH_TOKEN_VALIDATOR,
  useClass: SupabaseAuthService,
};

@Module({
  imports: [SupabaseModule],
  providers: [SupabaseAuthGuard, authTokenValidatorProvider],
  exports: [SupabaseAuthGuard, authTokenValidatorProvider],
})
export class IamModule {}
