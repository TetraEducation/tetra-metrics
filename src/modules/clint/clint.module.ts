import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { ClintService } from '@/modules/clint/application/services/clint.service';
import { ClintSyncService } from '@/modules/clint/application/services/clint-sync.service';
import { ClintApiClient } from '@/modules/clint/infra/api/clint-api.client';
import { ClintSyncController } from '@/modules/clint/interface/http/clint-sync.controller';

@Module({
  imports: [
    SupabaseModule,
    LeadsModule,
    HttpModule.registerAsync({
      useFactory: () => {
        const token = process.env.CLINT_API_TOKEN;
        if (!token) {
          throw new Error('CLINT_API_TOKEN não configurado no .env');
        }
        return {
          baseURL: 'https://api.clint.digital/v1',
          headers: {
            'api-token': token,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        };
      },
    }),
  ],
  providers: [ClintService, ClintSyncService, ClintApiClient],
  controllers: [ClintSyncController],
  exports: [ClintService, ClintSyncService],
})
export class ClintModule {}
