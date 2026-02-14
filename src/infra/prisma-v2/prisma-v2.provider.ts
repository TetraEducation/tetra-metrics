import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Provider } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

export const PRISMA_V2 = Symbol('PRISMA_V2_CLIENT');

type PrismaClientCtor = new (options?: unknown) => unknown;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const resolveGeneratedClientPath = () => {
  if (process.env.PRISMA_V2_CLIENT_ENTRYPOINT) {
    return process.env.PRISMA_V2_CLIENT_ENTRYPOINT;
  }

  const clientBase = join(process.cwd(), 'generated', 'prisma', 'client');
  const candidates = [`${clientBase}.js`, `${clientBase}.ts`];
  const existing = candidates.find((candidate) => existsSync(candidate));

  return existing ?? candidates[0];
};

export const prismaV2Provider: Provider = {
  provide: PRISMA_V2,
  useFactory: async () => {
    const databaseUrl = requiredEnv('DATABASE_URL_V2');
    const clientFile = resolveGeneratedClientPath();
    const clientUrl = pathToFileURL(clientFile).href;

    const moduleExports = (await import(clientUrl)) as { PrismaClient: PrismaClientCtor };
    const { PrismaClient } = moduleExports;

    const adapter = new PrismaPg({ connectionString: databaseUrl });

    return new PrismaClient({ adapter });
  },
};
