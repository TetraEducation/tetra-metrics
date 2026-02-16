import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { isSupabaseEnabled } from '@/infra/flags/supabase.flag';
import { LeadsModule } from '@/modules/leads/leads.module';
import { IamModule } from '@/modules/iam/iam.modules';
import { MetricsModule } from '@/modules/metrics/metrics.module';
import { ClintModule } from '@/modules/clint/clint.module';
import { ActiveCampaignModule } from '@/modules/activecampaign/activecampaign.module';
import { ImportsModule } from '@/modules/imports/imports.module';
import { LeadsV2Module } from '@/modules/leads-v2/leads-v2.module';

const baseImports = [
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  LeadsV2Module,
];

const supabaseImports = [
  SupabaseModule,
  LeadsModule,
  IamModule,
  MetricsModule,
  ClintModule,
  ActiveCampaignModule,
  ImportsModule,
];

const appImports = [...baseImports, ...(isSupabaseEnabled() ? supabaseImports : [])];

@Module({
  imports: appImports,
  controllers: [],
  providers: [],
})
export class AppModule {}
