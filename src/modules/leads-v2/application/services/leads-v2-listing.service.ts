import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';

import type {
  LeadListingItem,
  LeadsListingResult,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';
import {
  buildLeadsV2OrderBy,
  buildLeadsV2Where,
} from '@/modules/leads-v2/application/services/leads-v2-prisma-listing-query.helper';

const LEAD_IDENTIFIER_EMAIL = 'EMAIL';
const LEAD_IDENTIFIER_PHONE = 'PHONE';

type ListingIdentifierRow = {
  type: string;
  value: string;
  isPrimary: boolean;
  createdAt: Date;
};

type ListingLeadRow = {
  name: string;
  lastActivityAt: Date | null;
  identifiers: ListingIdentifierRow[];
};

type PrismaV2Client = {
  tags: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
  leads: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    findMany: (args: {
      where: Record<string, unknown>;
      select: {
        name: true;
        lastActivityAt: true;
        identifiers: {
          select: { type: true; value: true; isPrimary: true; createdAt: true };
          orderBy: Array<{ isPrimary: 'desc' } | { createdAt: 'asc' }>;
        };
      };
      orderBy: Array<
        | { lastActivityAt: 'asc' | 'desc' }
        | { createdAt: 'asc' | 'desc' }
        | { name: 'asc' | 'desc' }
      >;
      skip: number;
      take: number;
    }) => Promise<ListingLeadRow[]>;
  };
};

@Injectable()
export class LeadsV2ListingService {
  private readonly logger = new Logger(LeadsV2ListingService.name);

  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async listLeads(params: LeadsListingSearchDto): Promise<LeadsListingResult<LeadListingItem>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const perPage = params.perPage && params.perPage > 0 ? params.perPage : 20;
    const skip = (page - 1) * perPage;

    this.logger.debug(`Listando leads com parâmetros: ${JSON.stringify(params)}`);

    const { where, shortCircuit } = await buildLeadsV2Where(params, this.prisma);
    if (shortCircuit) {
      return { data: [], page, perPage, total: 0 };
    }

    const orderBy = buildLeadsV2OrderBy(params);
    const [total, leads] = await Promise.all([
      this.prisma.leads.count({ where }),
      this.prisma.leads.findMany({
        where,
        select: {
          name: true,
          lastActivityAt: true,
          identifiers: {
            select: { type: true, value: true, isPrimary: true, createdAt: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
        orderBy,
        skip,
        take: perPage,
      }),
    ]);

    return {
      data: leads.map((lead) => this.mapLead(lead)),
      page,
      perPage,
      total,
    };
  }

  private mapLead(lead: ListingLeadRow): LeadListingItem {
    return {
      nome: lead.name,
      email: this.pickIdentifierValue(lead.identifiers, LEAD_IDENTIFIER_EMAIL),
      telefone: this.pickIdentifierValue(lead.identifiers, LEAD_IDENTIFIER_PHONE),
      ultimoContatoComercial: lead.lastActivityAt?.toISOString() ?? null,
    };
  }

  private pickIdentifierValue(identifiers: ListingIdentifierRow[], type: string): string | null {
    const filtered = identifiers.filter((identifier) => identifier.type === type);
    if (filtered.length === 0) return null;

    const primary = filtered.find((identifier) => identifier.isPrimary);
    if (primary?.value) {
      return primary.value;
    }

    const sorted = [...filtered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return sorted[0]?.value ?? null;
  }
}
