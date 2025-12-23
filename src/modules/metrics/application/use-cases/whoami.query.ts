import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/iam/domain/authenticated-user';

@Injectable()
export class WhoAmIQuery {
  execute(user: AuthenticatedUser) {
    return { ok: true, user };
  }
}
