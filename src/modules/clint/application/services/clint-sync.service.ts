import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { ClintApiClient } from '@/modules/clint/infra/api/clint-api.client';
import {
  pickEmail,
  pickName,
  pickPhone,
  pickTagKeys,
} from '@/modules/clint/application/mappers/clint.mapper';
import {
  chooseBetterName,
  normalizeName,
  removeNameDuplication,
} from '@/modules/clint/application/utils/name-validator';

export interface ClintSyncReport {
  dryRun: boolean;
  totals: {
    tags: number;
    origins: number;
    groups: number;
    lostStatus: number;
    contacts: number;
    contactsIgnoredNoEmail: number;
    leadsUpserted: number;
    leadTagsLinked: number;
    funnelEntriesUpserted: number;
  };
  warnings: string[];
  errors: Array<{
    type: string;
    status?: string;
    page?: number;
    error: string;
    statusCode?: number | null;
  }>;
}

@Injectable()
export class ClintSyncService {
  private readonly logger = new Logger(ClintSyncService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    private readonly clintApi: ClintApiClient,
  ) {}

  async run({
    dryRun,
    skipContacts = false,
    skipDeals = false,
  }: {
    dryRun: boolean;
    skipContacts?: boolean;
    skipDeals?: boolean;
  }): Promise<ClintSyncReport> {
    this.logger.log(
      `Iniciando sincronização do Clint (dryRun=${dryRun}, skipContacts=${skipContacts}, skipDeals=${skipDeals})`,
    );

    this.logger.log('Buscando catálogos (tags, origins, groups, lost-status)...');
    const [tags, origins, groups, lostStatus] = await Promise.all([
      this.clintApi.tags(),
      this.clintApi.origins(),
      this.clintApi.groups(),
      this.clintApi.lostStatus(),
    ]);

    const report: ClintSyncReport = {
      dryRun,
      totals: {
        tags: tags.length,
        origins: origins.length,
        groups: groups.length,
        lostStatus: lostStatus.length,
        contacts: 0,
        contactsIgnoredNoEmail: 0,
        leadsUpserted: 0,
        leadTagsLinked: 0,
        funnelEntriesUpserted: 0,
      },
      warnings: [],
      errors: [],
    };

    this.logger.log(`Processando ${tags.length} tags...`);
    if (!dryRun) {
      for (const t of tags) {
        const tag = t as { name?: string; key?: string; title?: string };
        const key = (tag?.name ?? tag?.key ?? tag?.title ?? '').trim();
        if (!key) continue;

        const keyNormalized = key.toLowerCase().trim();

        await this.supabase
          .from('tags')
          .upsert(
            { key, name: key, category: 'clint', weight: 1 },
            { onConflict: 'key_normalized' },
          );
      }
    }

    this.logger.log(`Processando ${origins.length} origins...`);
    if (!dryRun) {
      for (const o of origins) {
        const origin = o as {
          id?: string | number;
          name?: string;
          title?: string;
          stages?: Array<{
            id?: string;
            label?: string;
            order?: number;
            type?: string;
          }>;
        };
        const originId = String(origin?.id ?? '').trim();
        const originName = String(origin?.name ?? origin?.title ?? originId).trim();
        if (!originId) {
          this.logger.warn(`Origin sem ID encontrada, pulando...`);
          continue;
        }

        const funnelKey = `clint-origin-${originId}`;
        const funnelKeyNormalized = funnelKey.toLowerCase().trim();

        const existingFunnel = await this.supabase
          .from('funnels')
          .select('id, name')
          .eq('key_normalized', funnelKeyNormalized)
          .maybeSingle();

        if (existingFunnel.error) {
          this.logger.warn(
            `Erro ao buscar funnel existente para origin ${originId}: ${existingFunnel.error.message}`,
          );
        }

        const funnelUp = await this.supabase
          .from('funnels')
          .upsert({ key: funnelKey, name: originName }, { onConflict: 'key_normalized' })
          .select('id, name')
          .single();

        if (funnelUp.error) {
          this.logger.error(
            `Erro ao criar/atualizar funnel para origin ${originId}: ${funnelUp.error.message}`,
          );
          continue;
        }

        const funnelId = funnelUp.data?.id;
        if (!funnelId) {
          this.logger.warn(`Funnel criado mas sem ID retornado para origin ${originId}`);
          continue;
        }

        const aliasResult = await this.supabase.from('funnel_aliases').upsert(
          {
            funnel_id: funnelId,
            source_system: 'clint',
            source_key: originId,
          },
          { onConflict: 'source_system,source_key' },
        );

        if (aliasResult.error) {
          this.logger.error(
            `Erro ao criar funnel_alias para origin ${originId}: ${aliasResult.error.message}`,
          );
        } else {
          this.logger.debug(
            `Funnel criado/atualizado: ${originName} (origin_id: ${originId}, funnel_id: ${funnelId})`,
          );
        }

        if (existingFunnel.data && existingFunnel.data.name !== originName) {
          this.logger.debug(
            `Nome do funnel atualizado: "${existingFunnel.data.name}" → "${originName}" (origin_id: ${originId})`,
          );
        }

        const stages = origin.stages ?? [];
        this.logger.debug(`Origin ${originId} tem ${stages.length} stages`);

        for (const s of stages) {
          const stageRef = String(s?.id ?? '').trim();
          if (!stageRef) continue;

          const stageKey = `clint-stage-${stageRef}`;
          const stageName = String(s?.label ?? stageKey).trim();
          const pos = Number(s?.order ?? 0) || 0;

          const stageUpsert = await this.supabase
            .from('funnel_stages')
            .upsert(
              {
                funnel_id: funnelId,
                key: stageKey,
                name: stageName,
                position: pos,
              },
              { onConflict: 'funnel_id,key_normalized' },
            )
            .select('id')
            .single();

          if (stageUpsert.error) {
            this.logger.warn(
              `Erro ao upsert funnel_stage ${stageKey} no funnel ${funnelId}: ${stageUpsert.error.message}`,
            );
          } else {
            this.logger.debug(
              `Stage criada/atualizada: ${stageName} (stage_id: ${stageRef}, funnel_id: ${funnelId}, position: ${pos})`,
            );
          }
        }
      }
    }

    this.logger.log(`Groups encontrados: ${groups.length} (usado apenas para telemetria)`);

    const fallbackFunnelKey = 'clint-origin-unknown';
    const fallbackFunnelKeyNormalized = fallbackFunnelKey.toLowerCase().trim();

    if (!dryRun) {
      const fallbackUpsert = await this.supabase
        .from('funnels')
        .upsert(
          { key: fallbackFunnelKey, name: 'Clint (origem não informada)' },
          { onConflict: 'key_normalized' },
        );

      if (fallbackUpsert.error) {
        this.logger.error(`Erro ao criar funnel fallback: ${fallbackUpsert.error.message}`);
      }
    }

    if (skipContacts) {
      this.logger.log('⏭️  [CONTACTS] Pulando processamento de contatos (--skip-contacts)');
    } else {
      this.logger.log(
        '🔵 [CONTACTS] Buscando e processando contatos da API do Clint (página por página)...',
      );

      const CHUNK_SIZE = 50; // Processar 50 contatos por vez
      const BATCH_DELAY_MS = 100;

      let currentPage = 1;
      let hasMorePages = true;
      let totalPages = 0;
      let totalContactsProcessed = 0;
      let totalContactsFetched = 0;

      while (hasMorePages) {
        let pageResult = await this.clintApi.contactsPage(currentPage);

        if (currentPage === 1 && totalPages === 0) {
          totalPages = pageResult.totalPages;
          this.logger.log(
            `🔵 [CONTACTS] Total de páginas: ${totalPages} (~${pageResult.totalCount} contatos)`,
          );
          if (pageResult.data.length > 0) {
            this.logger.log(
              `🔵 [CONTACTS] Primeiro contato (amostra): ${JSON.stringify(
                pageResult.data[0],
                null,
                2,
              )}`,
            );
          }
        }

        let retryCount = 0;
        const MAX_RETRIES = 3;

        while (
          pageResult.data.length === 0 &&
          retryCount < MAX_RETRIES &&
          (totalPages === 0 || currentPage <= totalPages)
        ) {
          retryCount++;
          const delayMs = retryCount * 1000;
          const totalPagesStr = totalPages > 0 ? `/${totalPages}` : '';
          this.logger.warn(
            `⚠️ [CONTACTS] Página ${currentPage}${totalPagesStr} vazia (tentativa ${retryCount}/${MAX_RETRIES}). Aguardando ${delayMs}ms antes de tentar novamente...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          pageResult = await this.clintApi.contactsPage(currentPage);

          if (totalPages === 0 && pageResult.totalPages > 0) {
            totalPages = pageResult.totalPages;
          }
        }

        const contacts = pageResult.data;
        report.totals.contacts += contacts.length;
        totalContactsFetched += contacts.length;

        if (contacts.length === 0) {
          this.logger.warn(
            `⚠️ [CONTACTS] Página ${currentPage}/${totalPages} ainda vazia após ${MAX_RETRIES} tentativas. Finalizando processamento de contatos.`,
          );
          break;
        }

        this.logger.log(
          `🔵 [CONTACTS] Página ${currentPage}/${totalPages}: ${contacts.length} contatos recebidos (total acumulado: ${totalContactsFetched})`,
        );

        const totalChunks = Math.ceil(contacts.length / CHUNK_SIZE);

        for (let chunkStart = 0; chunkStart < contacts.length; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, contacts.length);
          const chunk = contacts.slice(chunkStart, chunkEnd);
          const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;

          const contactDataMap = new Map<
            string,
            {
              email?: string;
              phone?: string;
              leadId?: string;
              leadData?: {
                full_name: string;
                first_contact_at: string;
                last_activity_at: string;
              };
              identifiers: Array<{
                type: string;
                value: string;
                value_normalized: string;
                is_primary: boolean;
              }>;
              source?: {
                source_ref: string;
                first_seen_at: string;
                last_seen_at: string;
                meta: unknown;
              };
              events: Array<{
                event_type: string;
                occurred_at: string;
                dedupe_key: string;
                payload: unknown;
              }>;
              leadTags: Array<{
                tag_id: string;
                source_ref: string;
                meta: unknown;
              }>;
              tagEvents: Array<{
                event_type: string;
                occurred_at: string;
                dedupe_key: string;
                payload: unknown;
              }>;
              leadUpdates?: {
                last_activity_at?: string;
                first_contact_at?: string;
                full_name?: string;
              };
            }
          >();

          for (const c of chunk) {
            const contactNumberInPage = chunkStart + chunk.indexOf(c) + 1;
            const contactNumberGlobal = totalContactsProcessed + contactNumberInPage;

            try {
              await this.processContactForBatch(
                c,
                contactNumberGlobal,
                totalContactsFetched,
                report,
                dryRun,
                contactDataMap,
              );
            } catch (error) {
              this.logger.error(
                `❌ [CONTACTS] Erro ao processar contato ${contactNumberGlobal}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }

          if (!dryRun && contactDataMap.size > 0) {
            await this.executeBatchInserts(contactDataMap);
          }

          if (chunkEnd < contacts.length && !dryRun) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
          }
        }

        totalContactsProcessed += contacts.length;

        const pageProgress = ((currentPage / totalPages) * 100).toFixed(1);
        this.logger.log(
          `📊 [CONTACTS] Progresso: ${pageProgress}% (página ${currentPage}/${totalPages}, ${totalContactsProcessed} contatos processados, ${report.totals.leadsUpserted} leads criados/atualizados)`,
        );

        hasMorePages = pageResult.hasNext && currentPage < totalPages;
        currentPage++;

        if (currentPage > 1000) {
          this.logger.warn('⚠️ [CONTACTS] Limite de 1000 páginas atingido');
          break;
        }
      }

      this.logger.log(
        `✅ Contatos concluídos: ${totalContactsProcessed} contatos processados, ${report.totals.leadsUpserted} leads criados/atualizados, ${report.totals.contactsIgnoredNoEmail} ignorados (sem email e sem telefone)`,
      );

      this.logger.log(
        `📊 [RESUMO CONTACTS] Processados: ${totalContactsProcessed}, Leads criados/atualizados: ${report.totals.leadsUpserted}, Ignorados (sem email e sem telefone): ${report.totals.contactsIgnoredNoEmail}`,
      );
    }

    if (skipDeals) {
      this.logger.log('⏭️  [DEALS] Pulando processamento de deals (--skip-deals)');
    } else {
      this.logger.log('🔵 [DEALS] Buscando deals (OPEN, WON, LOST) por status e página...');
      const DEAL_STATUSES: Array<'OPEN' | 'WON' | 'LOST'> = ['OPEN', 'WON', 'LOST'];

      for (const status of DEAL_STATUSES) {
        this.logger.log(`🔵 [DEALS] Processando status: ${status}`);
        let currentDealPage = 1;
        let hasMoreDeals = true;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        while (hasMoreDeals) {
          try {
            const pageResult = await this.clintApi.dealsPage({
              page: currentDealPage,
              limit: 200,
              status,
            });
            const deals = pageResult.data ?? [];
            const totalPages = pageResult.totalPages ?? 1;

            consecutiveErrors = 0;

            this.logger.log(
              `🔵 [DEALS] Status ${status}, página ${currentDealPage}/${totalPages}: ${deals.length} deals recebidos`,
            );

            if (deals.length === 0) {
              this.logger.warn(
                `⚠️ [DEALS] Nenhum deal retornado para status ${status} na página ${currentDealPage}`,
              );
              break;
            }

            await this.processDealsBatch(deals, status, currentDealPage, report, dryRun);

            const progress = ((currentDealPage / totalPages) * 100).toFixed(1);
            this.logger.log(
              `📊 [DEALS] Status ${status}: ${progress}% (página ${currentDealPage}/${totalPages}, ${report.totals.funnelEntriesUpserted} entries total)`,
            );

            hasMoreDeals = pageResult.hasNext && currentDealPage < totalPages;
            currentDealPage++;
          } catch (error) {
            consecutiveErrors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAxiosError = error && typeof error === 'object' && 'response' in error;
            const statusCode = isAxiosError ? (error as any).response?.status : null;

            this.logger.error(
              `❌ [DEALS] Erro ao buscar deals com status ${status} (página ${currentDealPage}): ${errorMessage} (HTTP ${statusCode || 'N/A'})`,
            );

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              this.logger.error(
                `❌ [DEALS] Muitos erros consecutivos (${consecutiveErrors}) para status ${status}. Pulando este status...`,
              );
              report.errors.push({
                type: 'clint_api_error',
                status,
                page: currentDealPage,
                error: errorMessage,
                statusCode,
              });
              break;
            }

            const delayMs = Math.pow(2, consecutiveErrors) * 1000;
            this.logger.warn(
              `⏳ [DEALS] Aguardando ${delayMs}ms antes de tentar novamente (tentativa ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));

            continue;
          }

          if (currentDealPage > 1000) {
            this.logger.warn(`⚠️ [DEALS] Limite de 1000 páginas atingido para status ${status}`);
            break;
          }

          if (hasMoreDeals && !dryRun) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        this.logger.log(`✅ [DEALS] Status ${status} concluído`);
      }

      this.logger.log(
        `✅ [DEALS] Todos os status processados. Total de entries: ${report.totals.funnelEntriesUpserted}`,
      );
    }

    // TODO: Implementar refresh de lead_stats (projeção/cache para métricas)
    // - Calcular first_contact_at, last_activity_at, distinct_tag_count, event_count, source_count
    // - Considerar implementar via RPC/job/cron ao invés de no sync
    // - Referência: INSERT INTO lead_stats ... ON CONFLICT DO UPDATE

    return report;
  }

  private async processContactForBatch(
    c: unknown,
    contactNumber: number,
    totalContacts: number,
    report: ClintSyncReport,
    dryRun: boolean,
    contactDataMap: Map<
      string,
      {
        email?: string;
        phone?: string;
        leadId?: string;
        leadData?: {
          full_name: string;
          first_contact_at: string;
          last_activity_at: string;
        };
        identifiers: Array<{
          type: string;
          value: string;
          value_normalized: string;
          is_primary: boolean;
        }>;
        source?: {
          source_ref: string;
          first_seen_at: string;
          last_seen_at: string;
          meta: unknown;
        };
        events: Array<{
          event_type: string;
          occurred_at: string;
          dedupe_key: string;
          payload: unknown;
        }>;
        leadTags: Array<{ tag_id: string; source_ref: string; meta: unknown }>;
        tagEvents: Array<{
          event_type: string;
          occurred_at: string;
          dedupe_key: string;
          payload: unknown;
        }>;
        leadUpdates?: {
          last_activity_at?: string;
          first_contact_at?: string;
          full_name?: string;
        };
      }
    >,
  ): Promise<void> {
    const email = pickEmail(c);
    const phone = pickPhone(c);
    const phoneNorm = phone ? phone.replace(/\D+/g, '') : null;

    if (!email && !phoneNorm) {
      report.totals.contactsIgnoredNoEmail++;
      if (contactNumber <= 5) {
        this.logger.warn(
          `⚠️ [CONTACTS] Contato ${contactNumber} ignorado: sem email e sem telefone. Dados: ${JSON.stringify(c)}`,
        );
      }
      return;
    }

    const mapKey = email ?? phoneNorm!;
    const hasEmail = !!email;
    const hasPhone = !!phoneNorm;

    if (contactNumber <= 5) {
      const identifiers: string[] = [];
      if (email) identifiers.push(`email=${email}`);
      if (phoneNorm) identifiers.push(`phone=${phoneNorm}`);
      this.logger.log(
        `🔵 [CONTACTS] Processando contato ${contactNumber}/${totalContacts}: ${identifiers.join(', ')}`,
      );
    }

    const rawName = pickName(c);
    const fullName = normalizeName(rawName);
    const tagKeys = pickTagKeys(c);

    if (dryRun) {
      report.totals.leadsUpserted++;
      report.totals.leadTagsLinked += tagKeys.length;
      return;
    }

    let leadId: string | undefined;
    if (email) {
      const existingByEmail = await this.supabase
        .from('lead_identifiers')
        .select('lead_id')
        .eq('type', 'email')
        .eq('value_normalized', email)
        .maybeSingle();

      if (existingByEmail.error) {
        this.logger.error(`❌ [SUPABASE] Erro ao buscar lead_identifier por email: ${existingByEmail.error.message}`);
        return;
      }
      leadId = existingByEmail.data?.lead_id;
    }

    if (!leadId && phoneNorm) {
      const existingByPhone = await this.supabase
        .from('lead_identifiers')
        .select('lead_id')
        .eq('type', 'phone')
        .eq('value_normalized', phoneNorm)
        .maybeSingle();

      if (existingByPhone.error) {
        this.logger.error(`❌ [SUPABASE] Erro ao buscar lead_identifier por telefone: ${existingByPhone.error.message}`);
        return;
      }
      leadId = existingByPhone.data?.lead_id;
    }

    const contact = c as {
      id?: string | number;
      created_at?: string;
      updated_at?: string;
    };
    const contactCreatedAt = contact?.created_at
      ? new Date(contact.created_at).toISOString()
      : null;
    const contactUpdatedAt = contact?.updated_at
      ? new Date(contact.updated_at).toISOString()
      : null;

    if (!contactDataMap.has(mapKey)) {
      contactDataMap.set(mapKey, {
        email: email || undefined,
        phone: phoneNorm || undefined,
        identifiers: [],
        events: [],
        leadTags: [],
        tagEvents: [],
      });
    }

    const contactData = contactDataMap.get(mapKey)!;

    if (!leadId) {
      const cleanName = fullName && fullName.trim() ? fullName.trim() : '';
      contactData.leadData = {
        full_name: cleanName,
        first_contact_at: contactCreatedAt || new Date().toISOString(),
        last_activity_at: contactUpdatedAt || new Date().toISOString(),
      };
      report.totals.leadsUpserted++;
    } else {
      contactData.leadId = leadId;
      contactData.leadUpdates = {};
      if (contactUpdatedAt) contactData.leadUpdates.last_activity_at = contactUpdatedAt;
      if (contactCreatedAt) contactData.leadUpdates.first_contact_at = contactCreatedAt;
      if (fullName) {
        const currentLead = await this.supabase
          .from('leads')
          .select('full_name')
          .eq('id', leadId)
          .single();
        const currentName = currentLead.data?.full_name || null;
        const bestName = chooseBetterName(currentName, fullName);
        if (bestName && bestName !== currentName) {
          contactData.leadUpdates.full_name = removeNameDuplication(bestName);
        }
      }
    }

    if (hasEmail) {
      contactData.identifiers.push({
        type: 'email',
        value: email!,
        value_normalized: email!,
        is_primary: true,
      });
    }

    if (hasPhone) {
      contactData.identifiers.push({
        type: 'phone',
        value: phone!,
        value_normalized: phoneNorm!,
        is_primary: !hasEmail,
      });
    }

    const contactId = String(contact?.id ?? '');
    contactData.source = {
      source_ref: `contact:${contactId}`,
      first_seen_at: contactCreatedAt || new Date().toISOString(),
      last_seen_at: contactUpdatedAt || new Date().toISOString(),
      meta: c ?? {},
    };

    contactData.events.push({
      event_type: 'contact.imported',
      occurred_at: contactCreatedAt || new Date().toISOString(),
      dedupe_key: `clint:contact:${contactId}`,
      payload: {
        contact_id: contactId,
        email: email || null,
        phone: phoneNorm || null,
        name: fullName,
      },
    });

    for (const keyRaw of tagKeys) {
      const key = keyRaw.trim();
      if (!key) continue;
      const keyNormalized = key.toLowerCase().trim();

      const tagUp = await this.supabase
        .from('tags')
        .upsert({ key, name: key, category: 'clint', weight: 1 }, { onConflict: 'key_normalized' })
        .select('id')
        .single();

      const tagId = tagUp.data?.id;
      if (!tagId) continue;

      await this.supabase
        .from('tag_aliases')
        .upsert(
          { tag_id: tagId, source_system: 'clint', source_key: keyNormalized },
          { onConflict: 'source_system,source_key' },
        );

      contactData.leadTags.push({
        tag_id: tagId,
        source_ref: `contact:${contactId}`,
        meta: { from: 'clint.contact.tags' },
      });

      contactData.tagEvents.push({
        event_type: 'tag.added',
        occurred_at: new Date().toISOString(),
        dedupe_key: `clint:tag:${contactId}:${keyNormalized}`,
        payload: { tag_key: key, tag_id: tagId, contact_id: contactId },
      });

      report.totals.leadTagsLinked++;
    }
  }

  private async executeBatchInserts(
    contactDataMap: Map<
      string,
      {
        email?: string;
        phone?: string;
        leadId?: string;
        leadData?: {
          full_name: string;
          first_contact_at: string;
          last_activity_at: string;
        };
        identifiers: Array<{
          type: string;
          value: string;
          value_normalized: string;
          is_primary: boolean;
        }>;
        source?: {
          source_ref: string;
          first_seen_at: string;
          last_seen_at: string;
          meta: unknown;
        };
        events: Array<{
          event_type: string;
          occurred_at: string;
          dedupe_key: string;
          payload: unknown;
        }>;
        leadTags: Array<{ tag_id: string; source_ref: string; meta: unknown }>;
        tagEvents: Array<{
          event_type: string;
          occurred_at: string;
          dedupe_key: string;
          payload: unknown;
        }>;
        leadUpdates?: {
          last_activity_at?: string;
          first_contact_at?: string;
          full_name?: string;
        };
      }
    >,
  ): Promise<void> {
    const BATCH_INSERT_SIZE = 100;

    const newLeads: Array<{
      mapKey: string;
      data: {
        full_name: string;
        first_contact_at: string;
        last_activity_at: string;
      };
    }> = [];
    for (const [mapKey, data] of contactDataMap.entries()) {
      if (data.leadData && !data.leadId) {
        newLeads.push({ mapKey, data: data.leadData });
      }
    }

    if (newLeads.length > 0) {
      const leadsToInsert = newLeads.map((l) => l.data);
      for (let i = 0; i < leadsToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = leadsToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase.from('leads').insert(chunk).select('id');

        if (result.error) {
          this.logger.error(`❌ [BATCH] Erro ao inserir leads: ${result.error.message}`);
        } else if (result.data) {
          for (let j = 0; j < result.data.length && i + j < newLeads.length; j++) {
            const mapKey = newLeads[i + j].mapKey;
            const leadId = result.data[j].id;
            const contactData = contactDataMap.get(mapKey);
            if (contactData) {
              contactData.leadId = leadId;
            }
          }
          this.logger.debug(`✅ [BATCH] ${result.data.length} leads inseridos`);
        }
      }
    }

    const updatePromises: Array<Promise<unknown>> = [];
    for (const data of contactDataMap.values()) {
      if (data.leadId && data.leadUpdates) {
        updatePromises.push(
          Promise.resolve(
            this.supabase.from('leads').update(data.leadUpdates).eq('id', data.leadId),
          ),
        );
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      this.logger.debug(`✅ [BATCH] ${updatePromises.length} leads atualizados`);
    }

    const identifiersToInsert: Array<{
      lead_id: string;
      type: string;
      value: string;
      value_normalized: string;
      is_primary: boolean;
    }> = [];
    for (const data of contactDataMap.values()) {
      if (data.leadId) {
        for (const ident of data.identifiers) {
          identifiersToInsert.push({ ...ident, lead_id: data.leadId });
        }
      }
    }

    if (identifiersToInsert.length > 0) {
      for (let i = 0; i < identifiersToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = identifiersToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase
          .from('lead_identifiers')
          .upsert(chunk, { onConflict: 'type,value_normalized' });
        if (result.error) {
          this.logger.error(`❌ [BATCH] Erro ao inserir identifiers: ${result.error.message}`);
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} identifiers inseridos`);
        }
      }
    }

    const sourcesToInsert: Array<{
      lead_id: string;
      source_system: string;
      source_ref: string;
      first_seen_at: string;
      last_seen_at: string;
      meta: unknown;
    }> = [];
    for (const data of contactDataMap.values()) {
      if (data.leadId && data.source) {
        sourcesToInsert.push({
          lead_id: data.leadId,
          source_system: 'clint',
          ...data.source,
        });
      }
    }

    if (sourcesToInsert.length > 0) {
      for (let i = 0; i < sourcesToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = sourcesToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase
          .from('lead_sources')
          .upsert(chunk, { onConflict: 'source_system,source_ref' });
        if (result.error) {
          this.logger.error(`❌ [BATCH] Erro ao inserir sources: ${result.error.message}`);
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} sources inseridos`);
        }
      }
    }

    const eventsToInsert: Array<{
      lead_id: string;
      event_type: string;
      source_system: string;
      occurred_at: string;
      ingested_at: string;
      dedupe_key: string;
      payload: unknown;
    }> = [];
    for (const data of contactDataMap.values()) {
      if (data.leadId) {
        for (const event of data.events) {
          eventsToInsert.push({
            lead_id: data.leadId,
            source_system: 'clint',
            ingested_at: new Date().toISOString(),
            ...event,
          });
        }
        for (const event of data.tagEvents) {
          eventsToInsert.push({
            lead_id: data.leadId,
            source_system: 'clint',
            ingested_at: new Date().toISOString(),
            ...event,
          });
        }
      }
    }

    if (eventsToInsert.length > 0) {
      for (let i = 0; i < eventsToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = eventsToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase.from('lead_events').insert(chunk);
        if (result.error) {
          if (
            result.error.message?.includes('duplicate key') ||
            result.error.message?.includes('unique constraint')
          ) {
            this.logger.debug(`⚠️ [BATCH] ${chunk.length} events já existiam (ignorados)`);
          } else {
            this.logger.error(`❌ [BATCH] Erro ao inserir events: ${result.error.message}`);
          }
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} events inseridos`);
        }
      }
    }

    const leadTagsMap = new Map<
      string,
      {
        lead_id: string;
        tag_id: string;
        source_system: string;
        source_ref: string;
        meta: unknown;
      }
    >();
    for (const data of contactDataMap.values()) {
      if (data.leadId) {
        for (const tag of data.leadTags) {
          const key = `${data.leadId}:${tag.tag_id}:clint`;
          if (!leadTagsMap.has(key)) {
            leadTagsMap.set(key, {
              lead_id: data.leadId,
              source_system: 'clint',
              ...tag,
            });
          }
        }
      }
    }

    const leadTagsToInsert = Array.from(leadTagsMap.values());

    if (leadTagsToInsert.length > 0) {
      for (let i = 0; i < leadTagsToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = leadTagsToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase
          .from('lead_tags')
          .upsert(chunk, { onConflict: 'lead_id,tag_id,source_system' });
        if (result.error) {
          this.logger.error(`❌ [BATCH] Erro ao inserir lead_tags: ${result.error.message}`);
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} lead_tags inseridos`);
        }
      }
    }
  }

  private async processContact(
    c: unknown,
    contactNumber: number,
    totalContacts: number,
    report: ClintSyncReport,
    dryRun: boolean,
  ): Promise<void> {
    // TODO: Remover após validação
    const contactDataMap = new Map();
    await this.processContactForBatch(
      c,
      contactNumber,
      totalContacts,
      report,
      dryRun,
      contactDataMap,
    );
  }

  /**
   * Process multiple deals in parallel batches for optimal performance
   * Processes up to 50 deals concurrently to avoid overwhelming the database
   */
  private async processDealsBatch(
    deals: unknown[],
    status: string,
    pageNumber: number,
    report: ClintSyncReport,
    dryRun: boolean,
  ): Promise<void> {
    if (deals.length === 0) return;

    const CONCURRENT_DEALS = 50;
    const chunks: unknown[][] = [];

    for (let i = 0; i < deals.length; i += CONCURRENT_DEALS) {
      chunks.push(deals.slice(i, i + CONCURRENT_DEALS));
    }

    this.logger.log(
      `🔵 [DEALS] Processando ${deals.length} deals em ${chunks.length} batches de até ${CONCURRENT_DEALS}`,
    );

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const chunkNumber = chunkIdx + 1;

      this.logger.debug(`🔵 [DEALS] Batch ${chunkNumber}/${chunks.length} (${chunk.length} deals)`);

      const results = await Promise.allSettled(
        chunk.map((deal, idx) =>
          this.processDeal(
            deal,
            chunkIdx * CONCURRENT_DEALS + idx + 1,
            deals.length,
            report,
            dryRun,
          ),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        this.logger.warn(
          `⚠️ [DEALS] Batch ${chunkNumber}/${chunks.length}: ${succeeded} ok, ${failed} erros`,
        );
      } else {
        this.logger.debug(
          `✅ [DEALS] Batch ${chunkNumber}/${chunks.length}: ${succeeded} deals processados`,
        );
      }

      if (chunkIdx < chunks.length - 1 && !dryRun) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Process a single deal using the SQL function for better performance and idempotency
   * The SQL function handles:
   * - Lead resolution/creation
   * - Funnel and stage resolution/creation
   * - Lead funnel entry upsert
   * - Transition tracking (stage/status changes)
   */
  private async processDeal(
    d: unknown,
    dealNumber: number,
    totalDeals: number,
    report: ClintSyncReport,
    dryRun: boolean,
  ): Promise<void> {
    if (dryRun) {
      report.totals.funnelEntriesUpserted++;
      return;
    }

    try {
      const { data, error } = await this.supabase.rpc('ingest_clint_deal', { p_deal: d });

      if (error) {
        this.logger.error(`❌ [DEALS] Erro ao processar deal ${dealNumber}: ${error.message}`);
        return;
      }

      const result = data as { status: string; reason?: string; transition_created?: boolean };

      if (result.status === 'ok') {
        report.totals.funnelEntriesUpserted++;
        if (dealNumber <= 5 || result.transition_created) {
          this.logger.debug(
            `✅ [DEALS] Deal ${dealNumber} processado${result.transition_created ? ' (transição criada)' : ''}`,
          );
        }
      } else if (result.status === 'ignored') {
        if (dealNumber <= 5) {
          this.logger.debug(`⚠️ [DEALS] Deal ${dealNumber} ignorado: ${result.reason}`);
        }
      } else if (result.status === 'error') {
        this.logger.error(`❌ [DEALS] Erro ao processar deal ${dealNumber}: ${result.reason}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ [DEALS] Exceção ao processar deal ${dealNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
