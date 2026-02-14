import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Provider } from '@nestjs/common';

export const PRISMA_V2 = Symbol('PRISMA_V2_CLIENT');

type PrismaClientCtor = new (options?: unknown) => unknown;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const resolveGeneratedClientPath = () =>
  process.env.PRISMA_V2_CLIENT_ENTRYPOINT ?? join(process.cwd(), 'generated', 'prisma', 'client.js');

export const prismaV2Provider: Provider = {
  provide: PRISMA_V2,
  useFactory: async () => {
    const databaseUrl = requiredEnv('DATABASE_URL_V2');
    const clientFile = resolveGeneratedClientPath();
    const clientUrl = pathToFileURL(clientFile).href;

    const moduleExports = (await import(clientUrl)) as { PrismaClient: PrismaClientCtor };
    const { PrismaClient } = moduleExports;

    return new PrismaClient({
      datasourceUrl: databaseUrl,
      datasources: { db: { url: databaseUrl } },
    });
  },
};
