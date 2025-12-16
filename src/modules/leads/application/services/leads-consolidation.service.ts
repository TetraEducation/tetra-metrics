import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';

export interface ConsolidateLeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  sourceName: string;
  externalId?: string | null;
  tags?: string[] | null;
}

@Injectable()
export class LeadsConsolidationService {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  // TODO: Implementar lógica de consolidação de leads
}
