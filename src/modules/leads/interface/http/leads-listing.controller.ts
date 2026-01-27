import { Controller, Get, Query } from '@nestjs/common';

import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsListingService } from '@/modules/leads/application/services/leads-listing.service';

@Controller('leads')
export class LeadsListingController {
  constructor(private readonly leadsListing: LeadsListingService) {}

  @Get('list')
  async list(@Query() query: LeadsListingSearchDto) {
    return this.leadsListing.listLeads(query);
  }
}
