import { BadRequestException } from '@nestjs/common';
import {
  normalizeEmail,
  normalizeText,
  purgeEmoji,
} from '@/modules/imports/application/utils/normalize';
import type { ImportLeadV2Input } from '@/modules/leads-v2/application/dto/import-lead-v2.input';
import type { LeadSourceSystemV2 } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

const SOURCE_SYSTEM_MAP: Record<string, LeadSourceSystemV2> = {
  clint: 'CLINT',
  spreadsheet: 'SPREADSHEET',
  planilha: 'SPREADSHEET',
  activecampaign: 'ACTIVECAMPAIGN',
  active_campaign: 'ACTIVECAMPAIGN',
  active: 'ACTIVECAMPAIGN',
  form: 'FORM',
  formulario: 'FORM',
};

const ERROR_MESSAGES = {
  missingIdentifiers: 'Informe ao menos email ou telefone.',
  missingSourceRef: 'Informe sourceRef quando sourceSystem existir.',
  missingSourceSystemWithUtm: 'Informe sourceSystem quando utm_campaing existir.',
};

export type NormalizedLeadImportInput = {
  name: string | null;
  emailRaw: string | null;
  emailNorm: string | null;
  phoneRaw: string | null;
  phoneNorm: string | null;
  sourceSystem: LeadSourceSystemV2 | null;
  sourceSystemLabel: string | null;
  sourceRef: string | null;
  utmCampaign: { raw: string; normalized: string } | null;
  meta: Record<string, unknown>;
};

export class LeadImportNormalizer {
  static normalize(input: ImportLeadV2Input): NormalizedLeadImportInput {
    const name = normalizeText(purgeEmoji(input.name));
    const emailRaw = this.extractTrimmed(input.email);
    const emailNorm = normalizeEmail(input.email);
    const phoneRaw = this.extractTrimmed(input.phone);
    const phoneNorm = this.normalizePhone(input.phone);
    const sourceSystemCandidate = this.extractTrimmed(input.sourceSystem ?? input.source);
    const sourceSystemLabel = this.normalizeSourceSystem(sourceSystemCandidate);
    const sourceSystem = sourceSystemLabel ? SOURCE_SYSTEM_MAP[sourceSystemLabel] ?? null : null;
    const sourceRef = this.extractTrimmed(input.sourceRef);
    const utmRawCandidate = this.extractUtmCandidate(input);
    const utmCampaign =
      utmRawCandidate !== null
        ? { raw: utmRawCandidate, normalized: utmRawCandidate.toLowerCase() }
        : null;
    const metaPayload = input.meta ?? {};

    const hasExplicitSourceSystem =
      typeof input.sourceSystem === 'string' && input.sourceSystem.trim().length > 0;

    if (!emailNorm && !phoneNorm) {
      throw new BadRequestException(ERROR_MESSAGES.missingIdentifiers);
    }
    if (hasExplicitSourceSystem && !sourceRef) {
      throw new BadRequestException(ERROR_MESSAGES.missingSourceRef);
    }
    if (utmCampaign && !sourceSystemLabel) {
      throw new BadRequestException(ERROR_MESSAGES.missingSourceSystemWithUtm);
    }

    return {
      name,
      emailRaw,
      emailNorm,
      phoneRaw,
      phoneNorm,
      sourceSystem,
      sourceSystemLabel,
      sourceRef,
      utmCampaign,
      meta: metaPayload,
    };
  }

  private static extractTrimmed(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private static normalizePhone(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const digits = value.replace(/\D+/g, '');
    return digits.length ? digits : null;
  }

  private static normalizeSourceSystem(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed.toLowerCase() : null;
  }

  private static extractUtmCandidate(input: ImportLeadV2Input): string | null {
    const utmValue =
      this.extractTrimmed((input as ImportLeadV2Input & { utm_campaign?: string }).utm_campaign) ??
      this.extractTrimmed((input as ImportLeadV2Input & { utm_campaing?: string }).utm_campaing);
    return utmValue;
  }
}
