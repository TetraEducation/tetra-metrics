import { Body, Controller, Get, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';

import type { SearchLeadDto } from '@/modules/leads/application/dto/search-lead.dto';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsSearchService } from '@/modules/leads/application/services/leads-search.service';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { ImportOneLeadDto } from '@/modules/leads/interface/http/import-one-lead.dto';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsImport: LeadsImportService,
    private readonly leadsSearch: LeadsSearchService,
    private readonly funnelAnalytics: FunnelAnalyticsService,
  ) {}

  @Post('import-one')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async importOne(@Body() body: ImportOneLeadDto) {
    const result = await this.leadsImport.findOrCreateLeadByIdentifiers({
      name: body.name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source ?? null,
    });

    return {
      ok: true,
      leadId: result.lead.id,
      created: result.created,
      phoneIgnoredDueToConflict: result.phoneIgnoredDueToConflict,
    };
  }

  @Get('search')
  /**
   * Search lead by name, email, or phone.
   * Optional query param:
   * - option: define explicit search field (email | phone | name). When provided,
   *   the corresponding field is required and only it will be used for the search.
   */
  async search(@Query() query: SearchLeadDto) {
    return this.leadsSearch.searchLead(query);
  }

  /**
   * Get funnel analytics with stage breakdown to identify bottlenecks
   * Query params:
   * - source_system (optional): filter by source system (e.g., 'clint', 'activecampaign')
   */
  @Get('funnels/analytics')
  async getFunnelAnalytics(@Query('source_system') sourceSystem?: string) {
    return this.funnelAnalytics.getFunnelAnalytics(sourceSystem);
  }
}
