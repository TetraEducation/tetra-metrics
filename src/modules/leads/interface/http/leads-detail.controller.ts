import { Controller, Get, Param } from '@nestjs/common';

// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { LeadsDetailService } from '@/modules/leads/application/services/leads-detail.service';

@Controller('leads')
export class LeadsDetailController {
  constructor(private readonly leadsDetail: LeadsDetailService) {}

  @Get(':id/details')
  async getLeadDetails(@Param('id') id: string) {
    return this.leadsDetail.getLeadDetails(id);
  }
}
