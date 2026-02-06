import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { normalizeText } from '@/modules/imports/application/utils/normalize';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';

@Injectable()
export class SupabaseLeadSearchProfileRepository {
  private readonly logger = new Logger(SupabaseLeadSearchProfileRepository.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async resolveLeadIdsByAnalyticsFilters(params: LeadsListingSearchDto): Promise<string[] | null> {
    const filters = this.extractAnalyticsFilters(params);
    if (filters.length === 0) return null;

    const availableColumns = await this.getAvailableColumns();
    if (!availableColumns || availableColumns.size === 0) {
      this.logger.warn(
        'lead_search_profile indisponível; aplicando fallback neutro para filtros analíticos.',
      );
      return null;
    }

    let query = this.supabase.from('lead_search_profile').select('lead_id');

    for (const filter of filters) {
      const matchingColumns = filter.columns.filter((column) => availableColumns.has(column));
      if (matchingColumns.length === 0) {
        continue;
      }

      for (const value of filter.values) {
        const pattern = `%${this.escapeLikePattern(value)}%`;
        const orExpression = matchingColumns
          .map((column) => `${column}.ilike.${pattern}`)
          .join(',');
        query = query.or(orExpression);
      }
    }

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

  private async getAvailableColumns(): Promise<Set<string> | null> {
    try {
      const { data, error } = await this.supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'lead_search_profile');

      if (error) return null;
      return new Set((data ?? []).map((row) => String(row.column_name)));
    } catch {
      return null;
    }
  }

  private extractAnalyticsFilters(
    params: LeadsListingSearchDto,
  ): Array<{ columns: string[]; values: string[] }> {
    const raw = params as LeadsListingSearchDto & Record<string, unknown>;

    const salary = this.pickValues(raw, [
      'salaryRange',
      'salaryMin',
      'salaryMax',
      'salario',
      'faixaSalarial',
    ]);
    const ageRange = this.pickValues(raw, ['ageRange', 'faixaEtaria', 'faixa_etaria', 'idade']);
    const companySize = this.pickValues(raw, [
      'companySize',
      'companyPorte',
      'porteEmpresa',
      'porte',
    ]);
    const education = this.pickValues(raw, ['educationLevel', 'schooling', 'escolaridade']);
    const gender = this.pickValues(raw, ['gender', 'genero', 'sexo']);

    return [
      {
        columns: ['salary_range_normalized', 'salary_range', 'salary_normalized', 'salary'],
        values: salary,
      },
      {
        columns: ['age_range_normalized', 'age_range', 'faixa_etaria_normalized', 'faixa_etaria'],
        values: ageRange,
      },
      {
        columns: [
          'company_size_normalized',
          'company_size',
          'company_porte_normalized',
          'porte_empresa_normalized',
          'porte_empresa',
          'porte',
        ],
        values: companySize,
      },
      {
        columns: [
          'education_level_normalized',
          'education_level',
          'schooling_normalized',
          'schooling',
          'escolaridade_normalized',
          'escolaridade',
        ],
        values: education,
      },
      {
        columns: [
          'gender_normalized',
          'gender',
          'genero_normalized',
          'genero',
          'sexo_normalized',
          'sexo',
        ],
        values: gender,
      },
    ].filter((entry) => entry.values.length > 0);
  }

  private pickValues(source: Record<string, unknown>, keys: string[]): string[] {
    const values = new Set<string>();

    for (const key of keys) {
      const value = source[key];
      if (typeof value !== 'string') continue;
      const normalized = normalizeText(value.trim());
      if (normalized) values.add(normalized);
    }

    return [...values];
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }
}
