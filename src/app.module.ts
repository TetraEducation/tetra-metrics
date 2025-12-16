import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { IamModule } from '@/modules/iam/iam.modules';
import { MetricsModule } from '@/modules/metrics/metrics.module';
import { ClintModule } from '@/modules/clint/clint.module';
import { ActiveCampaignModule } from '@/modules/activecampaign/activecampaign.module';
import { ImportsModule } from '@/modules/imports/imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    LeadsModule,
    IamModule,
    MetricsModule,
    ClintModule,
    ActiveCampaignModule,
    ImportsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}