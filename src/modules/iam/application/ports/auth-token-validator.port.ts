import type { AuthenticatedUser } from '../../domain/authenticated-user';

export const AUTH_TOKEN_VALIDATOR = Symbol('AUTH_TOKEN_VALIDATOR');

export interface AuthTokenValidatorPort {
  validate(token: string): Promise<AuthenticatedUser | null>;
}
