import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
import type { SearchLeadDto } from '@/modules/leads/application/dto/search-lead.dto';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsSearchService } from '@/modules/leads/application/services/leads-search.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsImport: LeadsImportService,
    private readonly leadsSearch: LeadsSearchService,
  ) {}

  @Post('import-one')
  async importOne(@Body() body: ImportLeadInput) {
    // TODO: Implementar endpoint
    return { ok: false, message: 'Endpoint não implementado' };
  }

  @Get('search')
  async search(@Query() query: SearchLeadDto) {
    return this.leadsSearch.searchLead(query);
  }
}
