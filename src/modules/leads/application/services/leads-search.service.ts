import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';
import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import type { SearchLeadDto } from '@/modules/leads/application/dto/search-lead.dto';

@Injectable()
export class LeadsSearchService {
  private readonly logger = new Logger(LeadsSearchService.name);

  constructor(@Inject(LEADS_REPOSITORY) private readonly leadsRepo: LeadsRepositoryPort) {}

  async searchLead(params: SearchLeadDto): Promise<LeadDetailDto> {
    // Validar que pelo menos um parâmetro foi fornecido
    if (!params.name && !params.email && !params.phone) {
      throw new NotFoundException('É necessário fornecer pelo menos um parâmetro de busca (name, email ou phone)');
    }

    this.logger.debug(`Buscando lead com parâmetros: ${JSON.stringify(params)}`);

    // Buscar lead_id pelos parâmetros fornecidos
    const leadId = await this.leadsRepo.findLeadBySearch({
      name: params.name,
      email: params.email,
      phone: params.phone,
    });

    if (!leadId) {
      throw new NotFoundException('Lead não encontrado com os parâmetros fornecidos');
    }

    this.logger.debug(`Lead encontrado: ${leadId}`);

    // Buscar detalhes completos do lead
    const leadDetail = await this.leadsRepo.getLeadDetailById(leadId);

    return leadDetail as LeadDetailDto;
  }
}

