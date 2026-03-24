import { normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';

const LEAD_IDENTIFIER_EMAIL = 'EMAIL';
const LEAD_IDENTIFIER_PHONE = 'PHONE';
const LEAD_SOURCE_CLINT = 'CLINT';

export type PrismaLeadsOrderBy = Array<
  { lastActivityAt: 'asc' | 'desc' } | { createdAt: 'asc' | 'desc' } | { name: 'asc' | 'desc' }
>;

export type PrismaLeadsFilter = {
  AND?: PrismaLeadsFilter[];
  name?: { contains: string; mode: 'insensitive' };
  lastActivityAt?: { gte?: Date; lte?: Date };
  identifiers?: { some: { type: string; valueNormalized: string } };
  tags?: { some: { tagId: { in: string[] } } };
  sources?: { some: { sourceSystem: string } };
  searchProfile?: { is: Record<string, unknown> };
  NOT?: { sources: { some: { sourceSystem: string } } };
};

type PrismaTagsLookupClient = {
  tags: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
};

export type BuildLeadsV2WhereResult = {
  where: PrismaLeadsFilter;
  shortCircuit: boolean;
};

export function buildLeadsV2OrderBy(params: LeadsListingSearchDto): PrismaLeadsOrderBy {
  const direction = params.orderDirection === 'asc' ? 'asc' : 'desc';
  if (params.orderBy === 'created_at') {
    return [{ createdAt: direction }];
  }
  if (params.orderBy === 'full_name') {
    return [{ name: direction }];
  }
  return [{ lastActivityAt: direction }];
}

export async function buildLeadsV2Where(
  params: LeadsListingSearchDto,
  prisma: PrismaTagsLookupClient,
): Promise<BuildLeadsV2WhereResult> {
  const where: PrismaLeadsFilter = {};
  const nameNorm = normalizeText(params.name);
  const emailNorm = normalizeEmail(params.email);
  const phoneNorm = normalizePhone(params.phone);

  if (nameNorm) {
    where.name = { contains: nameNorm, mode: 'insensitive' };
  }

  if (params.lastActivityFrom || params.lastActivityTo) {
    where.lastActivityAt = {};
    if (params.lastActivityFrom) where.lastActivityAt.gte = new Date(params.lastActivityFrom);
    if (params.lastActivityTo) where.lastActivityAt.lte = new Date(params.lastActivityTo);
  }

  const identifierFilters: PrismaLeadsFilter[] = [];
  if (emailNorm) {
    identifierFilters.push({
      identifiers: {
        some: {
          type: LEAD_IDENTIFIER_EMAIL,
          valueNormalized: emailNorm,
        },
      },
    });
  }
  if (phoneNorm) {
    identifierFilters.push({
      identifiers: {
        some: {
          type: LEAD_IDENTIFIER_PHONE,
          valueNormalized: phoneNorm,
        },
      },
    });
  }
  if (identifierFilters.length > 0) {
    where.AND = [...(where.AND ?? []), ...identifierFilters];
  }

  const tagIds = await resolveTagIds(params, prisma);
  if (tagIds && tagIds.length === 0) {
    where.tags = { some: { tagId: { in: [] } } };
    return { where, shortCircuit: true };
  }
  if (tagIds && tagIds.length > 0) {
    where.tags = { some: { tagId: { in: tagIds } } };
  }

  if (params.hasClintSource === true) {
    where.sources = { some: { sourceSystem: LEAD_SOURCE_CLINT } };
  } else if (params.hasClintSource === false) {
    where.NOT = { sources: { some: { sourceSystem: LEAD_SOURCE_CLINT } } };
  }

  const searchProfileWhere: Record<string, unknown> = {};
  const searchProfileAnd: Array<Record<string, unknown>> = [];
  const hasSearchProfileFilters =
    params.salaryMin !== undefined ||
    params.salaryMax !== undefined ||
    params.ageMin !== undefined ||
    params.ageMax !== undefined ||
    hasListValue(params.gender) ||
    hasListValue(params.companySize) ||
    hasListValue(params.educationLevel) ||
    hasListValue(params.excelKnowledge) ||
    hasListValue(params.powerBiKnowledge) ||
    hasListValue(params.jobRole) ||
    params.currentCompany !== undefined;

  if (params.salaryMin !== undefined) {
    searchProfileAnd.push({
      OR: [{ salaryMax: null }, { salaryMax: { gte: params.salaryMin } }],
    });
  }
  if (params.salaryMax !== undefined) {
    searchProfileAnd.push({
      OR: [{ salaryMin: null }, { salaryMin: { lte: params.salaryMax } }],
    });
  }
  if (params.ageMin !== undefined) {
    searchProfileAnd.push({
      OR: [{ ageMax: null }, { ageMax: { gte: params.ageMin } }],
    });
  }
  if (params.ageMax !== undefined) {
    searchProfileAnd.push({
      OR: [{ ageMin: null }, { ageMin: { lte: params.ageMax } }],
    });
  }
  if (hasListValue(params.gender)) {
    searchProfileWhere.gender = { in: params.gender };
  }
  if (hasListValue(params.companySize)) {
    searchProfileWhere.companySize = { in: params.companySize };
  }
  if (hasListValue(params.educationLevel)) {
    searchProfileWhere.educationLevel = { in: params.educationLevel };
  }
  if (hasListValue(params.excelKnowledge)) {
    searchProfileWhere.excelKnowledge = { in: params.excelKnowledge };
  }
  if (hasListValue(params.powerBiKnowledge)) {
    searchProfileWhere.powerBiKnowledge = { in: params.powerBiKnowledge };
  }
  if (hasListValue(params.jobRole)) {
    searchProfileWhere.jobRole = { in: params.jobRole };
  }
  if (params.currentCompany) {
    searchProfileWhere.currentCompany = {
      contains: params.currentCompany,
      mode: 'insensitive',
    };
  }

  if (searchProfileAnd.length > 0) {
    searchProfileWhere.AND = searchProfileAnd;
  }

  if (hasSearchProfileFilters) {
    where.searchProfile = {
      is: searchProfileWhere,
    };
  }

  return { where, shortCircuit: false };
}

function hasListValue<T extends string>(value?: readonly T[]): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

function normalizePhone(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
}

async function resolveTagIds(
  params: LeadsListingSearchDto,
  prisma: PrismaTagsLookupClient,
): Promise<string[] | null> {
  if (!params.campaignTagKey && !params.tag && !params.tagId && !params.campaignName) return null;

  const ids = new Set<string>();
  if (params.tagId) ids.add(params.tagId);

  if (params.tag) {
    const tags = await prisma.tags.findMany({
      where: { key: params.tag.trim() },
      select: { id: true },
    });
    for (const tag of tags) ids.add(tag.id);
  }

  if (params.campaignTagKey) {
    const tags = await prisma.tags.findMany({
      where: { key: params.campaignTagKey.trim() },
      select: { id: true },
    });
    for (const tag of tags) ids.add(tag.id);
  }

  if (params.campaignName) {
    const name = params.campaignName.trim();
    if (name) {
      const normalizedName = normalizeText(name) ?? name;
      const tags = await prisma.tags.findMany({
        where: {
          OR: [
            { name: { contains: name, mode: 'insensitive' } },
            { key: { contains: name, mode: 'insensitive' } },
            { keyNormalized: { contains: normalizedName, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      for (const tag of tags) ids.add(tag.id);
    }
  }

  return [...ids];
}
