import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  AttachIdentifierInputV2,
  AttachIdentifiersResultV2,
  LeadEventTypeV2,
  LeadSourceSystemV2,
  LeadsV2RepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import type { LeadV2 } from '@/modules/leads-v2/domain/lead-v2';

type PrismaV2Client = {
  leads: {
    create: (args: { data: { name: string } }) => Promise<{ id: string; name: string; createdAt: Date }>;
    update: (args: { where: { id: string }; data: { name: string } }) => Promise<unknown>;
    deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown>;
    findUnique: (args: {
      where: { id: string };
      select: { id: true; name: true; createdAt: true };
    }) => Promise<{ id: string; name: string; createdAt: Date } | null>;
  };
  leadIdentifiers: {
    create: (args: {
      data: {
        leadId: string;
        type: string;
        value: string;
        valueNormalized: string;
        isPrimary: boolean;
      };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: { type: string; valueNormalized: string };
      data: { isPrimary: boolean; value: string };
    }) => Promise<unknown>;
    findFirst: (args: {
      where: { type: string; valueNormalized: string };
      select: { leadId: true };
    }) => Promise<{ leadId: string } | null>;
  };
  leadSources: {
    upsert: (args: {
      where: {
        sourceSystem_sourceRef: {
          sourceSystem: LeadSourceSystemV2;
          sourceRef: string;
        };
      };
      create: {
        leadId: string;
        sourceSystem: LeadSourceSystemV2;
        sourceRef: string;
        firstSeenAt: Date;
        lastSeenAt: Date;
        meta: Record<string, unknown>;
      };
      update: {
        lastSeenAt: Date;
        meta: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  };
  tags: {
    upsert: (args: {
      where: { keyNormalized: string };
      create: {
        key: string;
        keyNormalized: string;
        name: string;
        category: string | null;
        weight: number;
      };
      update: {
        name: string;
        category: string | null;
        weight: number;
        updatedAt: Date;
      };
    }) => Promise<{ id: string }>;
  };
  tagAliases: {
    upsert: (args: {
      where: {
        sourceSystem_sourceKey: {
          sourceSystem: LeadSourceSystemV2;
          sourceKey: string;
        };
      };
      create: {
        tagId: string;
        sourceSystem: LeadSourceSystemV2;
        sourceKey: string;
      };
      update: {};
    }) => Promise<unknown>;
  };
  leadTags: {
    upsert: (args: {
      where: {
        leadId_tagId_sourceSystem: {
          leadId: string;
          tagId: string;
          sourceSystem: LeadSourceSystemV2;
        };
      };
      create: {
        leadId: string;
        tagId: string;
        sourceSystem: LeadSourceSystemV2;
        sourceRef: string | null;
        firstSeenAt: Date;
        lastSeenAt: Date;
        meta: Record<string, unknown>;
      };
      update: {
        sourceRef: string | null;
        lastSeenAt: Date;
        meta: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  };
  leadEvents: {
    create: (args: {
      data: {
        leadId: string;
        eventType: LeadEventTypeV2;
        sourceSystem: LeadSourceSystemV2;
        occurredAt: Date;
        ingestedAt: Date;
        dedupeKey: string;
        payload: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class PrismaLeadsV2Repository implements LeadsV2RepositoryPort {
  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async findLeadBySearch(params: { email?: string; phone?: string }): Promise<string | null> {
    if (params.email) {
      const emailHit = await this.prisma.leadIdentifiers.findFirst({
        where: { type: 'email', valueNormalized: params.email },
        select: { leadId: true },
      });
      if (emailHit) return emailHit.leadId;
    }

    if (params.phone) {
      const phoneHit = await this.prisma.leadIdentifiers.findFirst({
        where: { type: 'phone', valueNormalized: params.phone },
        select: { leadId: true },
      });
      if (phoneHit) return phoneHit.leadId;
    }

    return null;
  }

  async createLead(payload: { name?: string | null }): Promise<LeadV2> {
    const lead = await this.prisma.leads.create({
      data: { name: payload.name ?? '' },
    });
    return this.mapLead(lead);
  }

  async attachIdentifiers(
    leadId: string,
    identifiers: AttachIdentifierInputV2[],
  ): Promise<AttachIdentifiersResultV2> {
    const conflicts: AttachIdentifiersResultV2['conflicts'] = [];

    for (const identifier of identifiers) {
      try {
        await this.prisma.leadIdentifiers.create({
          data: {
            leadId,
            type: identifier.type,
            value: identifier.value,
            valueNormalized: identifier.valueNorm,
            isPrimary: identifier.isPrimary ?? false,
          },
        });
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }

        conflicts.push({ type: identifier.type, valueNorm: identifier.valueNorm });

        if (identifier.onConflict === 'set_primary') {
          await this.prisma.leadIdentifiers.updateMany({
            where: {
              type: identifier.type,
              valueNormalized: identifier.valueNorm,
            },
            data: {
              isPrimary: identifier.isPrimary ?? true,
              value: identifier.value,
            },
          });
        }
      }
    }

    return { conflicts };
  }

  async updateLead(id: string, payload: { name: string }): Promise<void> {
    await this.prisma.leads.update({
      where: { id },
      data: { name: payload.name },
    });
  }

  async deleteLeads(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.leads.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  async getLeadById(id: string): Promise<LeadV2> {
    const lead = await this.prisma.leads.findUnique({
      where: { id },
      select: { id: true, name: true, createdAt: true },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    return this.mapLead(lead);
  }

  async upsertLeadSource(params: {
    leadId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceRef: string;
    meta?: Record<string, unknown>;
    lastSeenAt?: string;
  }): Promise<void> {
    const now = params.lastSeenAt ? new Date(params.lastSeenAt) : new Date();
    await this.prisma.leadSources.upsert({
      where: {
        sourceSystem_sourceRef: {
          sourceSystem: params.sourceSystem,
          sourceRef: params.sourceRef,
        },
      },
      create: {
        leadId: params.leadId,
        sourceSystem: params.sourceSystem,
        sourceRef: params.sourceRef,
        firstSeenAt: now,
        lastSeenAt: now,
        meta: params.meta ?? {},
      },
      update: {
        lastSeenAt: now,
        meta: params.meta ?? {},
      },
    });
  }

  async upsertTag(params: {
    key: string;
    keyNormalized: string;
    name: string;
    category?: string | null;
    weight?: number;
  }): Promise<string> {
    const normalized = params.keyNormalized;
    const result = await this.prisma.tags.upsert({
      where: { keyNormalized: normalized },
      create: {
        key: params.key,
        keyNormalized: normalized,
        name: params.name,
        category: params.category ?? null,
        weight: params.weight ?? 1,
      },
      update: {
        name: params.name,
        category: params.category ?? null,
        weight: params.weight ?? 1,
        updatedAt: new Date(),
      },
    });
    return result.id;
  }

  async upsertTagAlias(params: {
    tagId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceKey: string;
  }): Promise<void> {
    await this.prisma.tagAliases.upsert({
      where: {
        sourceSystem_sourceKey: {
          sourceSystem: params.sourceSystem,
          sourceKey: params.sourceKey,
        },
      },
      create: {
        tagId: params.tagId,
        sourceSystem: params.sourceSystem,
        sourceKey: params.sourceKey,
      },
      update: {},
    });
  }

  async upsertLeadTag(params: {
    leadId: string;
    tagId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceRef?: string | null;
    meta?: Record<string, unknown> | null;
    lastSeenAt?: string;
  }): Promise<void> {
    const lastSeenAt = params.lastSeenAt ? new Date(params.lastSeenAt) : new Date();
    await this.prisma.leadTags.upsert({
      where: {
        leadId_tagId_sourceSystem: {
          leadId: params.leadId,
          tagId: params.tagId,
          sourceSystem: params.sourceSystem,
        },
      },
      create: {
        leadId: params.leadId,
        tagId: params.tagId,
        sourceSystem: params.sourceSystem,
        sourceRef: params.sourceRef ?? null,
        firstSeenAt: lastSeenAt,
        lastSeenAt,
        meta: params.meta ?? {},
      },
      update: {
        sourceRef: params.sourceRef ?? null,
        lastSeenAt,
        meta: params.meta ?? {},
      },
    });
  }

  async createLeadEvent(params: {
    leadId: string;
    eventType: LeadEventTypeV2;
    sourceSystem: LeadSourceSystemV2;
    occurredAt: string;
    ingestedAt: string;
    dedupeKey: string;
    payload?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.prisma.leadEvents.create({
      data: {
        leadId: params.leadId,
        eventType: params.eventType,
        sourceSystem: params.sourceSystem,
        occurredAt: new Date(params.occurredAt),
        ingestedAt: new Date(params.ingestedAt),
        dedupeKey: params.dedupeKey,
        payload: params.payload ?? {},
      },
    });
  }

  private mapLead(row: { id: string; name: string | null; createdAt: Date }): LeadV2 {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    return (
      e?.code === 'P2002' ||
      e?.message?.toLowerCase().includes('unique constraint') === true ||
      e?.message?.toLowerCase().includes('duplicate key') === true
    );
  }
}
