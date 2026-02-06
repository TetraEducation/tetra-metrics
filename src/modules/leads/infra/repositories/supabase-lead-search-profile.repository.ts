import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
import { applyOpenRangeIntersectionFilter } from '@/modules/leads/application/utils/open-range-predicate';

@Injectable()
export class SupabaseLeadSearchProfileRepository {
  private readonly logger = new Logger(SupabaseLeadSearchProfileRepository.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async resolveLeadIdsByAnalyticsFilters(params: LeadsListingSearchDto): Promise<string[] | null> {
    const hasFilters =
      params.salaryMin !== undefined ||
      params.salaryMax !== undefined ||
      params.ageMin !== undefined ||
      params.ageMax !== undefined ||
      params.gender !== undefined ||
      params.companySize !== undefined ||
      params.educationLevel !== undefined;
    if (!hasFilters) return null;

    let query = this.supabase.from('lead_search_profile').select('lead_id');

    query = applyOpenRangeIntersectionFilter(
      query,
      { profileMin: 'salary_min', profileMax: 'salary_max' },
      { min: params.salaryMin, max: params.salaryMax },
    );
    query = applyOpenRangeIntersectionFilter(
      query,
      { profileMin: 'age_min', profileMax: 'age_max' },
      { min: params.ageMin, max: params.ageMax },
    );

    if (params.gender) query = query.eq('gender', params.gender);
    if (params.companySize) query = query.eq('company_size', params.companySize);
    if (params.educationLevel) query = query.eq('education_level', params.educationLevel);

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
}
