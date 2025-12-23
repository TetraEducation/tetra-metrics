import { Controller, Post, Query } from '@nestjs/common';
import { ClintSyncService } from '@/modules/clint/application/services/clint-sync.service';

@Controller('sync/clint')
export class ClintSyncController {
  constructor(private readonly service: ClintSyncService) {}

  @Post('run')
  async run(@Query('dryRun') dryRun?: string) {
    return this.service.run({ dryRun: dryRun === 'true' });
  }
}
