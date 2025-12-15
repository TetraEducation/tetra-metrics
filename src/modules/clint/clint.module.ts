import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { LeadsModule } from '@/modules/leads/leads.module';
import { ClintService } from '@/modules/clint/application/services/clint.service';

@Module({
  imports: [
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
  providers: [ClintService],
  exports: [ClintService],
})
export class ClintModule {}
