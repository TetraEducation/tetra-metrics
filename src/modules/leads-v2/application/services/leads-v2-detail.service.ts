import { Inject, Injectable } from '@nestjs/common';

import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import {
  LEADS_V2_REPOSITORY,
  type LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

@Injectable()
export class LeadsV2DetailService {
  constructor(
    @Inject(LEADS_V2_REPOSITORY)
    private readonly repository: LeadsV2RepositoryPort,
  ) {}

  async getLeadDetails(leadId: string): Promise<LeadDetailDto> {
    return this.repository.getLeadDetailById(leadId);
  }
}
