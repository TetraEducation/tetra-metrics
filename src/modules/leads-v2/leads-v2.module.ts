import { Module } from '@nestjs/common';
import { PrismaV2Module } from '@/infra/prisma-v2/prisma-v2.module';
import { LEADS_V2_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { PrismaLeadsV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2.repository';
import { LeadsV2Controller } from '@/modules/leads-v2/interface/http/leads-v2.controller';

@Module({
  imports: [PrismaV2Module],
  providers: [
    LeadsV2ImportService,
    {
      provide: LEADS_V2_REPOSITORY,
      useClass: PrismaLeadsV2Repository,
    },
  ],
  controllers: [LeadsV2Controller],
})
export class LeadsV2Module {}
