import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { normalizeText } from '@/modules/imports/application/utils/normalize';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';

type AnalyticsFilters = {
  salaryMin?: number;
  salaryMax?: number;
  ageMin?: number;
  ageMax?: number;
  genders: string[];
  companySizes: string[];
  educationLevels: string[];
};

@Injectable()
export class SupabaseLeadSearchProfileRepository {
  private readonly logger = new Logger(SupabaseLeadSearchProfileRepository.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async resolveLeadIdsByAnalyticsFilters(params: LeadsListingSearchDto): Promise<string[] | null> {
    const filters = this.extractAnalyticsFilters(params);
    if (!this.hasAnalyticsFilters(filters)) return null;

    let query = this.supabase.from('lead_search_profile').select('lead_id');

    if (filters.salaryMin !== undefined) {
      query = query.gte('salary_max', filters.salaryMin);
    }
    if (filters.salaryMax !== undefined) {
      query = query.lte('salary_min', filters.salaryMax);
    }
    if (filters.ageMin !== undefined) {
      query = query.gte('age_max', filters.ageMin);
    }
    if (filters.ageMax !== undefined) {
      query = query.lte('age_min', filters.ageMax);
    }

    query = this.applyDiscreteFilter(query, 'gender', filters.genders);
    query = this.applyDiscreteFilter(query, 'company_size', filters.companySizes);
    query = this.applyDiscreteFilter(query, 'education_level', filters.educationLevels);

    try {
      const { data, error } = await query;
      if (error) {
        this.logger.warn(
          `Falha ao aplicar filtros analíticos em lead_search_profile (${error.message}); fallback neutro.`,
        );
        return null;
      }

      const ids = new Set((data ?? []).map((row) => row.lead_id as string));
      return [...ids];
    } catch (error) {
      this.logger.warn(
        'Erro inesperado no lead_search_profile; fallback neutro para listagem.',
        error,
      );
      return null;
    }
  }

  private extractAnalyticsFilters(params: LeadsListingSearchDto): AnalyticsFilters {
    const raw = params as LeadsListingSearchDto & Record<string, unknown>;

    return {
      salaryMin: this.pickNumber(raw, ['salaryMin', 'salarioMin', 'salary_min']),
      salaryMax: this.pickNumber(raw, ['salaryMax', 'salarioMax', 'salary_max']),
      ageMin: this.pickNumber(raw, ['ageMin', 'idadeMin', 'age_min']),
      ageMax: this.pickNumber(raw, ['ageMax', 'idadeMax', 'age_max']),
      companySizes: this.pickValues(raw, ['companySize', 'companyPorte', 'porteEmpresa', 'porte']),
      educationLevels: this.pickValues(raw, ['educationLevel', 'schooling', 'escolaridade']),
      genders: this.pickValues(raw, ['gender', 'genero', 'sexo']),
    };
  }

  private hasAnalyticsFilters(filters: AnalyticsFilters): boolean {
    return (
      filters.salaryMin !== undefined ||
      filters.salaryMax !== undefined ||
      filters.ageMin !== undefined ||
      filters.ageMax !== undefined ||
      filters.genders.length > 0 ||
      filters.companySizes.length > 0 ||
      filters.educationLevels.length > 0
    );
  }

  private applyDiscreteFilter<
    T extends {
      eq: (column: string, value: string) => T;
      in: (column: string, values: string[]) => T;
    },
  >(query: T, column: string, values: string[]): T {
    if (values.length === 0) return query;
    if (values.length === 1) return query.eq(column, values[0]);
    return query.in(column, values);
  }

  private pickValues(source: Record<string, unknown>, keys: string[]): string[] {
    const values = new Set<string>();

    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') {
        const splitValues = value.split(',').map((part) => part.trim());
        for (const item of splitValues) {
          const normalized = normalizeText(item);
          if (normalized) values.add(normalized);
        }
      }
    }

    return [...values];
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = source[key];
      const parsed = this.toNumber(value);
      if (parsed !== undefined) return parsed;
    }

    return undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return undefined;

    const parsed = Number(value.trim().replace(',', '.'));
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
  }
}
