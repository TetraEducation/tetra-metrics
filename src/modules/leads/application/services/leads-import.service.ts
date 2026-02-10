import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
import {
  LEADS_REPOSITORY,
  type LeadsRepositoryPort,
} from '@/modules/leads/application/ports/leads-repository.port';
import { normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';
import type { Lead } from '@/modules/leads/domain/lead';

export type ImportOneLeadResult = {
  lead: Lead;
  created: boolean;
  phoneIgnoredDueToConflict: boolean;
};

@Injectable()
export class LeadsImportService {
  private readonly logger = new Logger(LeadsImportService.name);

  constructor(
    @Inject(LEADS_REPOSITORY)
    private readonly repository: LeadsRepositoryPort,
  ) {}

  async findOrCreateLeadByIdentifiers(input: ImportLeadInput): Promise<ImportOneLeadResult> {
    const name = normalizeText(input.name);
    const emailNorm = normalizeEmail(input.email);
    const phoneNorm = this.normalizePhone(input.phone);
    const hasExplicitSourceSystem = typeof input.sourceSystem === 'string' && input.sourceSystem.trim().length > 0;
    const sourceSystemNorm = this.normalizeSourceSystem(
      hasExplicitSourceSystem ? input.sourceSystem : input.source,
    );
    const sourceRefNorm = this.normalizeSourceRef(input.sourceRef);

    if (!emailNorm && !phoneNorm) {
      throw new BadRequestException('Informe ao menos email ou telefone.');
    }
    if (hasExplicitSourceSystem && !sourceRefNorm) {
      throw new BadRequestException('Informe sourceRef quando sourceSystem existir.');
    }

    const emailRaw = typeof input.email === 'string' ? input.email.trim() : null;
    const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : null;

    let created = false;
    let phoneIgnoredDueToConflict = false;

    // 1) Se existir email, ele é a chave preferida.
    let leadId: string | null = null;
    if (emailNorm) {
      leadId = await this.repository.findLeadBySearch({ email: emailNorm });
    } else if (phoneNorm) {
      leadId = await this.repository.findLeadBySearch({ phone: phoneNorm });
    }

    if (!leadId) {
      const createdLead = await this.repository.createLead({ name: name ?? '' });
      leadId = createdLead.id;
      created = true;
    }

    // 2) Anexa email primeiro (para resolver races antes de anexar telefone).
    if (emailNorm) {
      await this.repository.attachIdentifiers(leadId, [
        {
          type: 'email',
          value: emailRaw ?? emailNorm,
          valueNorm: emailNorm,
          isPrimary: true,
          onConflict: 'set_primary',
        },
      ]);

      const actualLeadId = await this.repository.findLeadBySearch({ email: emailNorm });
      if (actualLeadId && actualLeadId !== leadId) {
        this.logger.warn(
          `Conflito de email detectado. Usando lead existente (${actualLeadId}) em vez de (${leadId}).`,
        );

        if (created) {
          await this.repository.deleteLeads([leadId]);
        }

        leadId = actualLeadId;
        created = false;
      }
    }

    // 3) Atualiza nome (sempre que fornecido e não vazio).
    if (name) {
      await this.repository.updateLead(leadId, { name });
    }

    // 3.1) Registra/atualiza origem do lead (lead_sources) quando fornecida.
    if (sourceSystemNorm) {
      await this.repository.upsertLeadSource({
        leadId,
        sourceSystem: sourceSystemNorm,
        sourceRef: sourceRefNorm ?? `lead:${leadId}`,
        meta: input.meta ?? {},
      });
    }

    // 4) Anexa telefone como best-effort (se conflitar com outro lead, ignora).
    if (phoneNorm) {
      const { conflicts } = await this.repository.attachIdentifiers(leadId, [
        {
          type: 'phone',
          value: phoneRaw ?? phoneNorm,
          valueNorm: phoneNorm,
          isPrimary: false,
          onConflict: 'ignore',
        },
      ]);

      phoneIgnoredDueToConflict = conflicts.some(
        (c) => c.type === 'phone' && c.valueNorm === phoneNorm,
      );
    }

    const lead = await this.repository.getLeadById(leadId);
    return { lead, created, phoneIgnoredDueToConflict };
  }

  private normalizePhone(phone?: string | null): string | null {
    if (typeof phone !== 'string') return null;
    const digits = phone.replace(/\D+/g, '');
    return digits.length ? digits : null;
  }

  private normalizeSourceSystem(source?: string | null): string | null {
    if (typeof source !== 'string') return null;
    const s = source.trim().toLowerCase();
    return s.length ? s : null;
  }

  private normalizeSourceRef(sourceRef?: string | null): string | null {
    if (typeof sourceRef !== 'string') return null;
    const s = sourceRef.trim();
    return s.length ? s : null;
  }
}
