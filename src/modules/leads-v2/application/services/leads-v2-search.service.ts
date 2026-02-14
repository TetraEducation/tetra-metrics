import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';
import { normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';
import {
  LEADS_V2_REPOSITORY,
  type LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import type { SearchLeadV2Dto, SearchLeadV2Option } from '@/modules/leads-v2/application/dto/search-lead-v2.dto';

const normalizePhone = (value?: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length ? digits : null;
};

@Injectable()
export class LeadsV2SearchService {
  private readonly logger = new Logger(LeadsV2SearchService.name);

  constructor(
    @Inject(LEADS_V2_REPOSITORY)
    private readonly repository: LeadsV2RepositoryPort,
  ) {}

  async searchLead(params: SearchLeadV2Dto): Promise<LeadDetailDto> {
    const normalized = {
      name: normalizeText(params.name),
      email: normalizeEmail(params.email),
      phone: normalizePhone(params.phone),
    };

    const searchByOption = async (option: SearchLeadV2Option) => {
      const value = normalized[option];
      if (!value) {
        throw new BadRequestException(
          `É necessário informar o parâmetro '${option}' quando option=${option}`,
        );
      }
      return this.repository.findLeadBySearch({ [option]: value });
    };

    this.logger.debug(`Buscando lead V2 com parâmetros: ${JSON.stringify(normalized)}`);

    let leadId: string | null = null;
    if (params.option !== undefined) {
      leadId = await searchByOption(params.option);
    } else {
      if (!normalized.name && !normalized.email && !normalized.phone) {
        throw new NotFoundException(
          'É necessário fornecer pelo menos um parâmetro de busca (name, email ou phone)',
        );
      }

      leadId = await this.repository.findLeadBySearch(normalized);
    }

    if (!leadId) {
      throw new NotFoundException('Lead não encontrado com os parâmetros fornecidos');
    }

    this.logger.debug(`Lead encontrado na V2: ${leadId}`);
    const leadDetail = await this.repository.getLeadDetailById(leadId);
    return leadDetail;
  }
}
