import { Module } from '@nestjs/common';
import { IamModule } from '@/modules/iam/iam.modules';
import { WhoAmIQuery } from '@/modules/metrics/application/use-cases/whoami.query';
import { MetricsController } from '@/modules/metrics/interface/http/metrics.controller';


@Module({
  imports: [IamModule],
  controllers: [MetricsController],
  providers: [WhoAmIQuery],
})
export class MetricsModule {}
