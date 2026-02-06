import { Controller, Get, Header, Query, UsePipes, ValidationPipe } from '@nestjs/common';

// biome-ignore lint/style/useImportType: ValidationPipe(transform) precisa da referência em tempo de execução
import { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
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
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async list(@Query() query: LeadsListingSearchDto) {
    return this.leadsListing.listLeads(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads-export.csv"')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async export(@Query() query: LeadsListingSearchDto) {
    return this.leadsExport.exportLeads(query);
  }
}
