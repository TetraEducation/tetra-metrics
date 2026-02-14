import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  AttachIdentifierInputV2,
  AttachIdentifiersResultV2,
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
