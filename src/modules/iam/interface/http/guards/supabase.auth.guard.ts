import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  AUTH_TOKEN_VALIDATOR,
  type AuthTokenValidatorPort,
} from '@/modules/iam/application/ports/auth-token-validator.port';
import type { AuthenticatedRequest } from '@/modules/iam/interface/http/types/authenticated-request';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_TOKEN_VALIDATOR)
    private readonly tokenValidator: AuthTokenValidatorPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.split(' ')[1];
    const user = await this.tokenValidator.validate(token);
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
