import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ImportLeadV2Input } from '@/modules/leads-v2/application/dto/import-lead-v2.input';
import {
  LEADS_V2_REPOSITORY,
  type LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import type { LeadIdentifierTypeV2, LeadV2 } from '@/modules/leads-v2/domain/lead-v2';
import { LeadImportNormalizer } from '@/modules/leads-v2/application/services/lead-import-normalizer';
import {
  buildImportCampaignMeta,
  buildLeadImportedEventProps,
  buildTagAddedEventProps,
  resolveSourceRefForRecords,
} from '@/modules/leads-v2/application/services/lead-import-records';

export type ImportOneLeadV2Result = {
  lead: LeadV2;
  created: boolean;
  phoneIgnoredDueToConflict: boolean;
};

const EMAIL_IDENTIFIER: LeadIdentifierTypeV2 = 'email';
const PHONE_IDENTIFIER: LeadIdentifierTypeV2 = 'phone';

@Injectable()
export class LeadsV2ImportService {
  private readonly logger = new Logger(LeadsV2ImportService.name);

  constructor(
    @Inject(LEADS_V2_REPOSITORY)
    private readonly repository: LeadsV2RepositoryPort,
  ) {}

  async findOrCreateLeadByIdentifiers(input: ImportLeadV2Input): Promise<ImportOneLeadV2Result> {
    const normalized = LeadImportNormalizer.normalize(input);

    let created = false;
    let phoneIgnoredDueToConflict = false;
    let leadId: string | null = null;

    if (normalized.emailNorm) {
      leadId = await this.repository.findLeadBySearch({ email: normalized.emailNorm });
    } else if (normalized.phoneNorm) {
      leadId = await this.repository.findLeadBySearch({ phone: normalized.phoneNorm });
    }

    if (!leadId) {
      const createdLead = await this.repository.createLead({ name: normalized.name ?? '' });
      leadId = createdLead.id;
      created = true;
    }

    if (normalized.emailNorm) {
      await this.repository.attachIdentifiers(leadId, [
        {
          type: EMAIL_IDENTIFIER,
          value: normalized.emailRaw ?? normalized.emailNorm,
          valueNorm: normalized.emailNorm,
          isPrimary: true,
          onConflict: 'set_primary',
        },
      ]);

      const actualLeadId = await this.repository.findLeadBySearch({ email: normalized.emailNorm });
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

    if (normalized.name) {
      await this.repository.updateLead(leadId, { name: normalized.name });
    }

    if (normalized.phoneNorm) {
      const { conflicts } = await this.repository.attachIdentifiers(leadId, [
        {
          type: PHONE_IDENTIFIER,
          value: normalized.phoneRaw ?? normalized.phoneNorm,
          valueNorm: normalized.phoneNorm,
          isPrimary: false,
          onConflict: 'ignore',
        },
      ]);

      phoneIgnoredDueToConflict = conflicts.some(
        (conflict) => conflict.type === PHONE_IDENTIFIER && conflict.valueNorm === normalized.phoneNorm,
      );
    }

    const sourceRefForRecords = resolveSourceRefForRecords(normalized.sourceRef, leadId);
    const nowIso = new Date().toISOString();

    if (normalized.sourceSystem) {
      await this.repository.upsertLeadSource({
        leadId,
        sourceSystem: normalized.sourceSystem,
        sourceRef: sourceRefForRecords,
        meta: normalized.meta,
        lastSeenAt: nowIso,
      });

      if (created) {
        const sourceLabel =
          normalized.sourceSystemLabel ?? normalized.sourceSystem.toLowerCase();
        await this.repository.createLeadEvent(
          buildLeadImportedEventProps({
            leadId,
            sourceSystem: normalized.sourceSystem,
            sourceRef: sourceRefForRecords,
            sourceLabel,
            occurredAt: nowIso,
            ingestedAt: nowIso,
          }),
        );
      }

      if (normalized.utmCampaign) {
        const { raw: utmRaw, normalized: utmNormalized } = normalized.utmCampaign;
        const tagId = await this.repository.upsertTag({
          key: utmRaw,
          keyNormalized: utmNormalized,
          name: utmRaw,
          category: 'campaign',
          weight: 1,
        });

        await this.repository.upsertTagAlias({
          tagId,
          sourceSystem: normalized.sourceSystem,
          sourceKey: utmNormalized,
        });

        await this.repository.upsertLeadTag({
          leadId,
          tagId,
          sourceSystem: normalized.sourceSystem,
          sourceRef: sourceRefForRecords,
          meta: buildImportCampaignMeta(),
          lastSeenAt: nowIso,
        });

        await this.repository.createLeadEvent(
          buildTagAddedEventProps({
            leadId,
            sourceSystem: normalized.sourceSystem,
            sourceRef: sourceRefForRecords,
            tagId,
            tagKey: utmRaw,
            tagKeyNormalized: utmNormalized,
            occurredAt: nowIso,
            ingestedAt: nowIso,
          }),
        );
      }
    }

    const lead = await this.repository.getLeadById(leadId);
    return { lead, created, phoneIgnoredDueToConflict };
  }
}
