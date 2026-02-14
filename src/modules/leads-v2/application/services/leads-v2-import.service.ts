import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  normalizeEmail,
  normalizeText,
  purgeEmoji,
} from '@/modules/imports/application/utils/normalize';
import type { ImportLeadV2Input } from '@/modules/leads-v2/application/dto/import-lead-v2.input';
import {
  LEADS_V2_REPOSITORY,
  type LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import type { LeadV2 } from '@/modules/leads-v2/domain/lead-v2';

export type ImportOneLeadV2Result = {
  lead: LeadV2;
  created: boolean;
  phoneIgnoredDueToConflict: boolean;
};

@Injectable()
export class LeadsV2ImportService {
  private readonly logger = new Logger(LeadsV2ImportService.name);

  constructor(
    @Inject(LEADS_V2_REPOSITORY)
    private readonly repository: LeadsV2RepositoryPort,
  ) {}

  async findOrCreateLeadByIdentifiers(input: ImportLeadV2Input): Promise<ImportOneLeadV2Result> {
    const name = normalizeText(purgeEmoji(input.name));
    const emailNorm = normalizeEmail(input.email);
    const phoneNorm = this.normalizePhone(input.phone);

    if (!emailNorm && !phoneNorm) {
      throw new BadRequestException('Informe ao menos email ou telefone.');
    }

    const emailRaw = typeof input.email === 'string' ? input.email.trim() : null;
    const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : null;

    let created = false;
    let phoneIgnoredDueToConflict = false;

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
          `Conflito de email detectado na V2. Usando lead existente (${actualLeadId}) em vez de (${leadId}).`,
        );

        if (created) {
          await this.repository.deleteLeads([leadId]);
        }

        leadId = actualLeadId;
        created = false;
      }
    }

    if (name) {
      await this.repository.updateLead(leadId, { name });
    }

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
}
