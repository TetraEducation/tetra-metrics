import { Module } from '@nestjs/common';
import { PRISMA_V2, prismaV2Provider } from '@/infra/prisma-v2/prisma-v2.provider';

@Module({
  providers: [prismaV2Provider],
  exports: [PRISMA_V2],
})
export class PrismaV2Module {}
