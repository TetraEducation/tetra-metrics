import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import type { ImportLeadV2Input } from '@/modules/leads-v2/application/dto/import-lead-v2.input';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { ImportOneLeadV2Dto } from '@/modules/leads-v2/interface/http/import-one-lead-v2.dto';

@Controller('v2/leads')
export class LeadsV2Controller {
  constructor(private readonly leadsImport: LeadsV2ImportService) {}

  @Post('import-one')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async importOne(@Body() body: ImportOneLeadV2Dto) {
    const input = {
      name: body.name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
    } as ImportLeadV2Input;

    const result = await this.leadsImport.findOrCreateLeadByIdentifiers(input);

    return {
      ok: true,
      leadId: result.lead.id,
      created: result.created,
      phoneIgnoredDueToConflict: result.phoneIgnoredDueToConflict,
    };
  }
}
