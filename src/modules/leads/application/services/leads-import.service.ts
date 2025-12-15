import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
import { LEADS_REPOSITORY, type LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import type { Lead, LeadIdentifier, LeadIdentifierType } from '@/modules/leads/domain/lead';

@Injectable()
export class LeadsImportService {
  private readonly logger = new Logger(LeadsImportService.name);

  constructor(
    @Inject(LEADS_REPOSITORY)
    private readonly repository: LeadsRepositoryPort,
  ) {}

  private normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    const normalized = String(email).trim().toLowerCase();
    return /\S+@\S+\.\S+/.test(normalized) ? normalized : null;
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = String(phone).replace(/\D+/g, '');
    if (digits.length < 8) return null;
    return digits;
  }

  async findOrCreateLeadByIdentifiers(input: ImportLeadInput): Promise<Lead> {
    const emailNorm = this.normalizeEmail(input.email);
    const phoneNorm = this.normalizePhone(input.phone);
    const nameNorm = this.normalizeName(input.name);

    if (!emailNorm && !phoneNorm) {
      throw new BadRequestException('Pelo menos email ou phone precisam existir e serem válidos.');
    }

    const identifiersValues = [emailNorm, phoneNorm].filter(Boolean) as string[];
    const existingIdentifiers = await this.repository.findIdentifiersByValues(identifiersValues);
    const leadIds = Array.from(new Set(existingIdentifiers.map((identifier) => identifier.leadId)));

    let targetLeadId: string;

    if (leadIds.length === 0) {
      const lead = await this.repository.createLead({ name: nameNorm });
      targetLeadId = lead.id;
      await this.attachIdentifiers(targetLeadId, [
        ...(emailNorm ? [{ type: 'email' as LeadIdentifierType, valueNorm: emailNorm }] : []),
        ...(phoneNorm ? [{ type: 'phone' as LeadIdentifierType, valueNorm: phoneNorm }] : []),
      ]);
    } else if (leadIds.length === 1) {
      targetLeadId = leadIds[0];
      await this.enrichLead(targetLeadId, nameNorm);
      await this.attachMissingIdentifiers(targetLeadId, existingIdentifiers, emailNorm, phoneNorm);
    } else {
      targetLeadId = leadIds[0];
      const mergeIds = leadIds.slice(1);
      this.logger.warn(
        `Merge de leads necessário: mantendo ${targetLeadId} e fundindo ${mergeIds.join(', ')}`,
      );

      await this.repository.reassignIdentifiers(targetLeadId, mergeIds);
      await this.repository.deleteLeads(mergeIds);
      await this.enrichLead(targetLeadId, nameNorm);
      await this.attachMissingIdentifiers(targetLeadId, existingIdentifiers, emailNorm, phoneNorm);
    }

    return this.repository.getLeadById(targetLeadId);
  }

  private async enrichLead(leadId: string, name?: string | null) {
    if (!name) return;
    await this.repository.updateLead(leadId, { name });
  }

  private async attachIdentifiers(
    leadId: string,
    identifiers: Array<{ type: LeadIdentifierType; valueNorm: string }>,
  ) {
    if (identifiers.length === 0) return;
    await this.repository.attachIdentifiers(leadId, identifiers);
  }

  private async attachMissingIdentifiers(
    leadId: string,
    existingIdentifiers: LeadIdentifier[],
    emailNorm: string | null,
    phoneNorm: string | null,
  ) {
    const missing: Array<{ type: LeadIdentifierType; valueNorm: string }> = [];
    if (emailNorm && !existingIdentifiers.some((identifier) => identifier.valueNorm === emailNorm)) {
      missing.push({ type: 'email', valueNorm: emailNorm });
    }
    if (phoneNorm && !existingIdentifiers.some((identifier) => identifier.valueNorm === phoneNorm)) {
      missing.push({ type: 'phone', valueNorm: phoneNorm });
    }

    if (missing.length === 0) return;

    try {
      await this.repository.attachIdentifiers(leadId, missing);
    } catch (error) {
      this.logger.warn(`Falha ao inserir identificadores (possível corrida): ${String(error)}`);
    }
  }

  private normalizeName(name?: string | null): string | null {
    if (!name) return null;
    const trimmed = name.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}


