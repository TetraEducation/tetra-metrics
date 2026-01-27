import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  LeadListingItem,
  LeadsListingResult,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';

@Injectable()
export class LeadsListingService {
  private readonly logger = new Logger(LeadsListingService.name);

  constructor(@Inject(LEADS_REPOSITORY) private readonly leadsRepo: LeadsRepositoryPort) {}

  async listLeads(params: LeadsListingSearchDto): Promise<LeadsListingResult<LeadListingItem>> {
    this.logger.debug(`Listando leads com parâmetros: ${JSON.stringify(params)}`);

    return this.leadsRepo.listLeads(params);
  }
}
