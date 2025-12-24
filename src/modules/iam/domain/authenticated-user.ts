export interface AuthenticatedUser {
  id: string;
  email: string | null;
  raw: unknown;
}
