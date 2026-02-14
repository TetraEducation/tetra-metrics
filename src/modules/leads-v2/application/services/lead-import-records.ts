import type { LeadSourceSystemV2 } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

const LEAD_SOURCE_REF_PREFIX = 'lead';
const LEAD_IMPORT_META_SOURCE = 'import-one.utm_campaign';

export function resolveSourceRefForRecords(sourceRef: string | null, leadId: string): string {
  return sourceRef ?? `${LEAD_SOURCE_REF_PREFIX}:${leadId}`;
}

export function buildLeadImportedEventProps(params: {
  leadId: string;
  sourceSystem: LeadSourceSystemV2;
  sourceRef: string;
  sourceLabel: string;
  occurredAt: string;
  ingestedAt: string;
}) {
  return {
    leadId: params.leadId,
    eventType: 'LEAD_IMPORTED' as const,
    sourceSystem: params.sourceSystem,
    occurredAt: params.occurredAt,
    ingestedAt: params.ingestedAt,
    dedupeKey: `${params.sourceSystem}:import-one:${params.sourceRef}:lead_imported`,
    payload: {
      source_ref: params.sourceRef,
      source: params.sourceLabel,
    },
  };
}

export function buildTagAddedEventProps(params: {
  leadId: string;
  sourceSystem: LeadSourceSystemV2;
  sourceRef: string;
  tagId: string;
  tagKey: string;
  tagKeyNormalized: string;
  occurredAt: string;
  ingestedAt: string;
}) {
  return {
    leadId: params.leadId,
    eventType: 'TAG_ADDED' as const,
    sourceSystem: params.sourceSystem,
    occurredAt: params.occurredAt,
    ingestedAt: params.ingestedAt,
    dedupeKey: `${params.sourceSystem}:import-one:${params.sourceRef}:tag_added:${params.tagKeyNormalized}`,
    payload: {
      tag_id: params.tagId,
      tag_key: params.tagKey,
      source_ref: params.sourceRef,
    },
  };
}

export function buildImportCampaignMeta() {
  return { from: LEAD_IMPORT_META_SOURCE };
}
