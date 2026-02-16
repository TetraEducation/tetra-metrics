import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  LeadSearchProfileFiltersV2,
  LeadSearchProfileUpsertInputV2,
  LeadSearchProfileV2,
  LeadsV2SearchProfileRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-search-profile.port';

type PrismaDecimal = { toNumber: () => number };

type SearchProfileRow = {
  leadId: string;
  salaryMin: PrismaDecimal | number | null;
  salaryMax: PrismaDecimal | number | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: string | null;
  companySize: string | null;
  educationLevel: string | null;
  excelKnowledge: string | null;
  jobRole: string | null;
  seniorityLevel: string | null;
  currentCompany: string | null;
  updatedAt: Date;
};

type PrismaV2Client = {
  leadSearchProfile: {
    upsert: (args: {
      where: { leadId: string };
      create: {
        leadId: string;
        salaryMin: number | null;
        salaryMax: number | null;
        ageMin: number | null;
        ageMax: number | null;
        gender: string | null;
        companySize: string | null;
        educationLevel: string | null;
        excelKnowledge: string | null;
        jobRole: string | null;
        seniorityLevel: string | null;
        currentCompany: string | null;
      };
      update: {
        salaryMin?: number | null;
        salaryMax?: number | null;
        ageMin?: number | null;
        ageMax?: number | null;
        gender?: string | null;
        companySize?: string | null;
        educationLevel?: string | null;
        excelKnowledge?: string | null;
        jobRole?: string | null;
        seniorityLevel?: string | null;
        currentCompany?: string | null;
        updatedAt: Date;
      };
    }) => Promise<unknown>;
    findUnique: (args: { where: { leadId: string } }) => Promise<SearchProfileRow | null>;
    findMany: (args: {
      where: {
        salaryMin?: { lte: number };
        salaryMax?: { gte: number };
        ageMin?: { lte: number };
        ageMax?: { gte: number };
        gender?: string;
        companySize?: string;
        educationLevel?: string;
      };
      select: { leadId: true };
      take: number;
    }) => Promise<Array<{ leadId: string }>>;
  };
};

@Injectable()
export class PrismaLeadsV2SearchProfileRepository implements LeadsV2SearchProfileRepositoryPort {
  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async upsertBatch(batch: LeadSearchProfileUpsertInputV2[]): Promise<void> {
    for (const item of batch) {
      await this.prisma.leadSearchProfile.upsert({
        where: { leadId: item.leadId },
        create: {
          leadId: item.leadId,
          salaryMin: item.salaryMin ?? null,
          salaryMax: item.salaryMax ?? null,
          ageMin: item.ageMin ?? null,
          ageMax: item.ageMax ?? null,
          gender: item.gender ?? null,
          companySize: item.companySize ?? null,
          educationLevel: item.educationLevel ?? null,
          excelKnowledge: item.excelKnowledge ?? null,
          jobRole: item.jobRole ?? null,
          seniorityLevel: item.seniorityLevel ?? null,
          currentCompany: item.currentCompany ?? null,
        },
        update: {
          salaryMin: item.salaryMin,
          salaryMax: item.salaryMax,
          ageMin: item.ageMin,
          ageMax: item.ageMax,
          gender: item.gender,
          companySize: item.companySize,
          educationLevel: item.educationLevel,
          excelKnowledge: item.excelKnowledge,
          jobRole: item.jobRole,
          seniorityLevel: item.seniorityLevel,
          currentCompany: item.currentCompany,
          updatedAt: new Date(),
        },
      });
    }
  }

  async findByLeadId(leadId: string): Promise<LeadSearchProfileV2 | null> {
    const row = await this.prisma.leadSearchProfile.findUnique({
      where: { leadId },
    });
    return row ? this.toDto(row) : null;
  }

  async findLeadIdsByFilters(filters: LeadSearchProfileFiltersV2): Promise<string[]> {
    const rows = await this.prisma.leadSearchProfile.findMany({
      where: {
        ...(typeof filters.salaryMin === 'number' ? { salaryMax: { gte: filters.salaryMin } } : {}),
        ...(typeof filters.salaryMax === 'number' ? { salaryMin: { lte: filters.salaryMax } } : {}),
        ...(typeof filters.ageMin === 'number' ? { ageMax: { gte: filters.ageMin } } : {}),
        ...(typeof filters.ageMax === 'number' ? { ageMin: { lte: filters.ageMax } } : {}),
        ...(filters.gender ? { gender: filters.gender } : {}),
        ...(filters.companySize ? { companySize: filters.companySize } : {}),
        ...(filters.educationLevel ? { educationLevel: filters.educationLevel } : {}),
      },
      select: { leadId: true },
      take: 2000,
    });
    return rows.map((row) => row.leadId);
  }

  private toDto(row: SearchProfileRow): LeadSearchProfileV2 {
    return {
      leadId: row.leadId,
      salaryMin: this.toNullableNumber(row.salaryMin),
      salaryMax: this.toNullableNumber(row.salaryMax),
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      gender: row.gender,
      companySize: row.companySize,
      educationLevel: row.educationLevel,
      excelKnowledge: row.excelKnowledge,
      jobRole: row.jobRole,
      seniorityLevel: row.seniorityLevel,
      currentCompany: row.currentCompany,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toNullableNumber(value: PrismaDecimal | number | null): number | null {
    if (value === null) return null;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }
}
