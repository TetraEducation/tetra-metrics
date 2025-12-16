import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { LeadsModule } from '@/modules/leads/leads.module';
import { ActiveCampaignService } from '@/modules/activecampaign/application/services/activecampaign.service';

@Module({
  imports: [
    LeadsModule,
    HttpModule.registerAsync({
      useFactory: () => {
        const token = process.env.ACTIVE_CAMPAING_TOKEN;
        const baseURL = process.env.ACTIVE_CAMPAING_URI;
        if (!token) {
          throw new Error('ACTIVE_CAMPAING_TOKEN não configurado no .env');
        }
        if (!baseURL) {
          throw new Error('ACTIVE_CAMPAING_URI não configurado no .env');
        }
        return {
          baseURL: `${baseURL}/api/3`,
          headers: {
            'Api-Token': token,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        };
      },
    }),
  ],
  providers: [ActiveCampaignService],
  exports: [ActiveCampaignService],
})
export class ActiveCampaignModule {}
