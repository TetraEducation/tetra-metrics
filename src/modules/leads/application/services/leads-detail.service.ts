import { Inject, Injectable } from '@nestjs/common';

import type { LeadDetailResponseDto } from '@/modules/leads/application/dto/lead-detail-response.dto';
import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';

@Injectable()
export class LeadsDetailService {
  constructor(@Inject(LEADS_REPOSITORY) private readonly leadsRepo: LeadsRepositoryPort) {}

  async getLeadDetails(leadId: string): Promise<LeadDetailResponseDto> {
    const leadDetail = (await this.leadsRepo.getLeadDetailById(leadId)) as LeadDetailDto;

    return {
      ...leadDetail,
      forms: leadDetail.surveys.map((survey) => ({
        submission_id: survey.submission_id,
        form_schema_id: survey.form_schema_id,
        form_name: survey.form_name,
        form_source_system: survey.form_source_system,
        submitted_at: survey.submitted_at,
        source_ref: survey.source_ref,
        dedupe_key: survey.dedupe_key,
        created_at: survey.created_at,
        raw_payload: survey.raw_payload,
        questions: survey.answers,
      })),
    };
  }
}
