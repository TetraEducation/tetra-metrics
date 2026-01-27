import { Controller, Get, Header, Query } from '@nestjs/common';

import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsExportService } from '@/modules/leads/application/services/leads-export.service';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsListingService } from '@/modules/leads/application/services/leads-listing.service';

@Controller('leads')
export class LeadsListingController {
  constructor(
    private readonly leadsListing: LeadsListingService,
    private readonly leadsExport: LeadsExportService,
  ) {}

  @Get('list')
  async list(@Query() query: LeadsListingSearchDto) {
    return this.leadsListing.listLeads(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads-export.csv"')
  async export(@Query() query: LeadsListingSearchDto) {
    return this.leadsExport.exportLeads(query);
  }
}
