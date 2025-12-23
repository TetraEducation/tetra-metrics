import type { Request } from 'express';
import type { AuthenticatedUser } from '@/modules/iam/domain/authenticated-user';

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
