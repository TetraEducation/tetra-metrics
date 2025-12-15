import { Body, Controller, Post } from '@nestjs/common';

import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsImport: LeadsImportService) {}

  @Post('import-one')
  async importOne(@Body() body: ImportLeadInput) {
    const lead = await this.leadsImport.findOrCreateLeadByIdentifiers(body);
    return { ok: true, lead };
  }
}


