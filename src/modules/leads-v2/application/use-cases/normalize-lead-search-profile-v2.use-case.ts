import { Injectable } from '@nestjs/common';
import {
  NormalizeLeadSearchProfileUseCase,
  type NormalizeLeadSearchProfileInput,
  type NormalizeLeadSearchProfileResult,
} from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';

export const NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME = 'normalize-lead-search-profile-v2';

@Injectable()
export class NormalizeLeadSearchProfileV2UseCase {
  constructor(private readonly baseUseCase: NormalizeLeadSearchProfileUseCase) {}

  async execute(
    input: Omit<NormalizeLeadSearchProfileInput, 'jobName'>,
  ): Promise<NormalizeLeadSearchProfileResult> {
    return this.baseUseCase.execute({
      ...input,
      jobName: NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
      metadata: {
        ...(input.metadata ?? {}),
        pipeline: 'v2_prisma',
      },
    });
  }
}
