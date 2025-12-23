import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
import {
  LEADS_REPOSITORY,
  type LeadsRepositoryPort,
} from '@/modules/leads/application/ports/leads-repository.port';
import type { Lead } from '@/modules/leads/domain/lead';

@Injectable()
export class LeadsImportService {
  private readonly logger = new Logger(LeadsImportService.name);

  constructor(
    @Inject(LEADS_REPOSITORY)
    private readonly repository: LeadsRepositoryPort,
  ) {}

  // TODO: Implementar lógica de importação de leads
  async findOrCreateLeadByIdentifiers(input: ImportLeadInput): Promise<Lead> {
    throw new BadRequestException('Método não implementado');
  }
}
