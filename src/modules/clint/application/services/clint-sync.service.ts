import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE } from "@/infra/supabase/supabase.provider";
import { ClintApiClient } from "@/modules/clint/infra/api/clint-api.client";
import {
  pickEmail,
  pickName,
  pickPhone,
  pickTagKeys,
} from "@/modules/clint/application/mappers/clint.mapper";
import {
  chooseBetterName,
  normalizeName,
  removeNameDuplication,
} from "@/modules/clint/application/utils/name-validator";

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
}

@Injectable()
export class ClintSyncService {
  private readonly logger = new Logger(ClintSyncService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    private readonly clintApi: ClintApiClient
  ) {}

  async run({ dryRun }: { dryRun: boolean }): Promise<ClintSyncReport> {
    this.logger.log(`Iniciando sincronização do Clint (dryRun=${dryRun})`);

    // 1) Catálogos (tags/origins/groups/lost-status)
    this.logger.log(
      "Buscando catálogos (tags, origins, groups, lost-status)..."
    );
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
    };

    // TAGS (catálogo)
    this.logger.log(`Processando ${tags.length} tags...`);
    if (!dryRun) {
      for (const t of tags) {
        const tag = t as { name?: string; key?: string; title?: string };
        const key = (tag?.name ?? tag?.key ?? tag?.title ?? "").trim();
        if (!key) continue;

        const keyNormalized = key.toLowerCase().trim();

        await this.supabase
          .from("tags")
          .upsert(
            { key, name: key, category: "clint", weight: 1 },
            { onConflict: "key_normalized" }
          );
      }
    }

    // ORIGINS -> FUNNELS (catálogo)
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
        const originId = String(origin?.id ?? "").trim();
        const originName = String(
          origin?.name ?? origin?.title ?? originId
        ).trim();
        if (!originId) {
          this.logger.warn(`Origin sem ID encontrada, pulando...`);
          continue;
        }

        const funnelKey = `clint-origin-${originId}`;
        const funnelKeyNormalized = funnelKey.toLowerCase().trim();

        // Verifica se o funnel já existe para atualizar o nome se mudou
        const existingFunnel = await this.supabase
          .from("funnels")
          .select("id, name")
          .eq("key_normalized", funnelKeyNormalized)
          .maybeSingle();

        if (existingFunnel.error) {
          this.logger.warn(
            `Erro ao buscar funnel existente para origin ${originId}: ${existingFunnel.error.message}`
          );
        }

        const funnelUp = await this.supabase
          .from("funnels")
          .upsert(
            { key: funnelKey, name: originName },
            { onConflict: "key_normalized" }
          )
          .select("id, name")
          .single();

        if (funnelUp.error) {
          this.logger.error(
            `Erro ao criar/atualizar funnel para origin ${originId}: ${funnelUp.error.message}`
          );
          continue;
        }

        const funnelId = funnelUp.data?.id;
        if (!funnelId) {
          this.logger.warn(
            `Funnel criado mas sem ID retornado para origin ${originId}`
          );
          continue;
        }

        // Cria ou atualiza funnel_alias
        const aliasResult = await this.supabase
          .from("funnel_aliases")
          .upsert(
            {
              funnel_id: funnelId,
              source_system: "clint",
              source_key: originId,
            },
            { onConflict: "source_system,source_key" }
          );

        if (aliasResult.error) {
          this.logger.error(
            `Erro ao criar funnel_alias para origin ${originId}: ${aliasResult.error.message}`
          );
        } else {
          this.logger.debug(
            `Funnel criado/atualizado: ${originName} (origin_id: ${originId}, funnel_id: ${funnelId})`
          );
        }

        // Log se o nome do funnel mudou
        if (existingFunnel.data && existingFunnel.data.name !== originName) {
          this.logger.debug(
            `Nome do funnel atualizado: "${existingFunnel.data.name}" → "${originName}" (origin_id: ${originId})`
          );
        }

        // ORIGIN.STAGES -> FUNNEL_STAGES (catálogo real do Kanban)
        const stages = origin.stages ?? [];
        this.logger.debug(`Origin ${originId} tem ${stages.length} stages`);

        for (const s of stages) {
          const stageRef = String(s?.id ?? "").trim();
          if (!stageRef) continue;

          const stageKey = `clint-stage-${stageRef}`;
          const stageName = String(s?.label ?? stageKey).trim();
          const pos = Number(s?.order ?? 0) || 0;

          const stageUpsert = await this.supabase
            .from("funnel_stages")
            .upsert(
              {
                funnel_id: funnelId,
                key: stageKey,
                name: stageName,
                position: pos,
              },
              { onConflict: "funnel_id,key_normalized" }
            )
            .select("id")
            .single();

          if (stageUpsert.error) {
            this.logger.warn(
              `Erro ao upsert funnel_stage ${stageKey} no funnel ${funnelId}: ${stageUpsert.error.message}`
            );
          } else {
            this.logger.debug(
              `Stage criada/atualizada: ${stageName} (stage_id: ${stageRef}, funnel_id: ${funnelId}, position: ${pos})`
            );
          }
        }
      }
    }

    // Groups são apenas para report/telemetria (não usamos mais para stages)
    this.logger.log(
      `Groups encontrados: ${groups.length} (usado apenas para telemetria)`
    );

    // Garante funil fallback (para deals sem origin)
    const fallbackFunnelKey = "clint-origin-unknown";
    const fallbackFunnelKeyNormalized = fallbackFunnelKey.toLowerCase().trim();

    if (!dryRun) {
      const fallbackUpsert = await this.supabase
        .from("funnels")
        .upsert(
          { key: fallbackFunnelKey, name: "Clint (origem não informada)" },
          { onConflict: "key_normalized" }
        );

      if (fallbackUpsert.error) {
        this.logger.error(
          `Erro ao criar funnel fallback: ${fallbackUpsert.error.message}`
        );
      }
    }

    // 2) CONTACTS (leads + identifiers + sources + lead_tags)
    // Processar página por página para não carregar tudo na memória
    this.logger.log(
      "🔵 [CONTACTS] Buscando e processando contatos da API do Clint (página por página)..."
    );

    const CHUNK_SIZE = 50; // Processar 50 contatos por vez
    const BATCH_DELAY_MS = 100; // Delay entre chunks (ms)

    let currentPage = 1;
    let hasMorePages = true;
    let totalPages = 0;
    let totalContactsProcessed = 0;
    let totalContactsFetched = 0;

    while (hasMorePages) {
      // Buscar uma página de contatos com retry em caso de página vazia (possível rate limit)
      let pageResult = await this.clintApi.contactsPage(currentPage);

      // Definir totalPages na primeira página (mesmo que venha vazia)
      if (currentPage === 1 && totalPages === 0) {
        totalPages = pageResult.totalPages;
        this.logger.log(
          `🔵 [CONTACTS] Total de páginas: ${totalPages} (~${pageResult.totalCount} contatos)`
        );
        if (pageResult.data.length > 0) {
          this.logger.log(
            `🔵 [CONTACTS] Primeiro contato (amostra): ${JSON.stringify(
              pageResult.data[0],
              null,
              2
            )}`
          );
        }
      }

      let retryCount = 0;
      const MAX_RETRIES = 3;

      // Se a página vier vazia, tentar novamente com delay progressivo (pode ser rate limit)
      // Só faz retry se não for a última página esperada
      while (
        pageResult.data.length === 0 &&
        retryCount < MAX_RETRIES &&
        (totalPages === 0 || currentPage <= totalPages)
      ) {
        retryCount++;
        const delayMs = retryCount * 1000; // Delay progressivo: 1s, 2s, 3s
        const totalPagesStr = totalPages > 0 ? `/${totalPages}` : "";
        this.logger.warn(
          `⚠️ [CONTACTS] Página ${currentPage}${totalPagesStr} vazia (tentativa ${retryCount}/${MAX_RETRIES}). Aguardando ${delayMs}ms antes de tentar novamente...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        pageResult = await this.clintApi.contactsPage(currentPage);

        // Atualizar totalPages se ainda não foi definido
        if (totalPages === 0 && pageResult.totalPages > 0) {
          totalPages = pageResult.totalPages;
        }
      }

      const contacts = pageResult.data;
      report.totals.contacts += contacts.length;
      totalContactsFetched += contacts.length;

      if (contacts.length === 0) {
        this.logger.warn(
          `⚠️ [CONTACTS] Página ${currentPage}/${totalPages} ainda vazia após ${MAX_RETRIES} tentativas. Finalizando processamento de contatos.`
        );
        break;
      }

      this.logger.log(
        `🔵 [CONTACTS] Página ${currentPage}/${totalPages}: ${contacts.length} contatos recebidos (total acumulado: ${totalContactsFetched})`
      );

      // Processar contatos da página em chunks
      const totalChunks = Math.ceil(contacts.length / CHUNK_SIZE);

      for (
        let chunkStart = 0;
        chunkStart < contacts.length;
        chunkStart += CHUNK_SIZE
      ) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, contacts.length);
        const chunk = contacts.slice(chunkStart, chunkEnd);
        const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;

        // Coletar dados do chunk para batch inserts
        const contactDataMap = new Map<
          string,
          {
            email: string;
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

        // Processar chunk coletando dados
        for (const c of chunk) {
          const contactNumberInPage = chunkStart + chunk.indexOf(c) + 1;
          const contactNumberGlobal =
            totalContactsProcessed + contactNumberInPage;

          try {
            await this.processContactForBatch(
              c,
              contactNumberGlobal,
              totalContactsFetched,
              report,
              dryRun,
              contactDataMap
            );
          } catch (error) {
            this.logger.error(
              `❌ [CONTACTS] Erro ao processar contato ${contactNumberGlobal}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Executar batch inserts
        if (!dryRun && contactDataMap.size > 0) {
          await this.executeBatchInserts(contactDataMap);
        }

        // Pequeno delay entre chunks
        if (chunkEnd < contacts.length && !dryRun) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      totalContactsProcessed += contacts.length;

      // Log de progresso por página
      const pageProgress = ((currentPage / totalPages) * 100).toFixed(1);
      this.logger.log(
        `📊 [CONTACTS] Progresso: ${pageProgress}% (página ${currentPage}/${totalPages}, ${totalContactsProcessed} contatos processados, ${report.totals.leadsUpserted} leads criados/atualizados)`
      );

      // Verificar se há mais páginas
      hasMorePages = pageResult.hasNext && currentPage < totalPages;
      currentPage++;

      // Safety: limite de 1000 páginas
      if (currentPage > 1000) {
        this.logger.warn("⚠️ [CONTACTS] Limite de 1000 páginas atingido");
        break;
      }
    }

    this.logger.log(
      `✅ Contatos concluídos: ${totalContactsProcessed} contatos processados, ${report.totals.leadsUpserted} leads criados/atualizados, ${report.totals.contactsIgnoredNoEmail} ignorados (sem email)`
    );

    // Resumo do processamento de contatos
    this.logger.log(
      `📊 [RESUMO CONTACTS] Processados: ${totalContactsProcessed}, Leads criados/atualizados: ${report.totals.leadsUpserted}, Ignorados (sem email): ${report.totals.contactsIgnoredNoEmail}`
    );

    // 3) DEALS (lead_funnel_entries)
    // Buscar OPEN, WON, LOST para garantir histórico completo
    this.logger.log(
      "🔵 [DEALS] Buscando deals (OPEN, WON, LOST) por status e página..."
    );
    const DEAL_STATUSES: Array<"OPEN" | "WON" | "LOST"> = [
      "OPEN",
      "WON",
      "LOST",
    ];

    for (const status of DEAL_STATUSES) {
      this.logger.log(`🔵 [DEALS] Processando status: ${status}`);
      let currentDealPage = 1;
      let hasMoreDeals = true;

      while (hasMoreDeals) {
        const pageResult = await this.clintApi.dealsPage({
          page: currentDealPage,
          limit: 200,
          status,
        });
        const deals = pageResult.data ?? [];
        const totalPages = pageResult.totalPages ?? 1;

        this.logger.log(
          `🔵 [DEALS] Status ${status}, página ${currentDealPage}/${totalPages}: ${deals.length} deals recebidos`
        );

        if (deals.length === 0) {
          this.logger.warn(
            `⚠️ [DEALS] Nenhum deal retornado para status ${status} na página ${currentDealPage}`
          );
          break;
        }

        // Processar deals da página atual
        for (let i = 0; i < deals.length; i++) {
          try {
            await this.processDeal(
              deals[i],
              i + 1,
              deals.length,
              report,
              dryRun
            );
          } catch (error) {
            this.logger.error(
              `❌ [DEALS] Erro ao processar deal ${
                i + 1
              } (status ${status}, página ${currentDealPage}): ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        const progress = ((currentDealPage / totalPages) * 100).toFixed(1);
        this.logger.log(
          `📊 [DEALS] Status ${status}: ${progress}% (página ${currentDealPage}/${totalPages}, ${report.totals.funnelEntriesUpserted} entries total)`
        );

        hasMoreDeals = pageResult.hasNext && currentDealPage < totalPages;
        currentDealPage++;

        // Safety: limite de 1000 páginas
        if (currentDealPage > 1000) {
          this.logger.warn(
            `⚠️ [DEALS] Limite de 1000 páginas atingido para status ${status}`
          );
          break;
        }

        // Delay entre páginas
        if (hasMoreDeals && !dryRun) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      this.logger.log(`✅ [DEALS] Status ${status} concluído`);
    }

    this.logger.log(
      `✅ [DEALS] Todos os status processados. Total de entries: ${report.totals.funnelEntriesUpserted}`
    );

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
        email: string;
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
    >
  ): Promise<void> {
    const email = pickEmail(c);
    if (!email) {
      report.totals.contactsIgnoredNoEmail++;
      if (contactNumber <= 5) {
        this.logger.warn(
          `⚠️ [CONTACTS] Contato ${contactNumber} ignorado: sem email. Dados: ${JSON.stringify(
            c
          )}`
        );
      }
      return;
    }

    if (contactNumber <= 5) {
      this.logger.log(
        `🔵 [CONTACTS] Processando contato ${contactNumber}/${totalContacts}: email=${email}`
      );
    }

    const rawName = pickName(c);
    const fullName = normalizeName(rawName);
    const phone = pickPhone(c);
    const tagKeys = pickTagKeys(c);

    if (dryRun) {
      report.totals.leadsUpserted++;
      report.totals.leadTagsLinked += tagKeys.length;
      return;
    }

    // Busca lead_id existente
    const existing = await this.supabase
      .from("lead_identifiers")
      .select("lead_id")
      .eq("type", "email")
      .eq("value_normalized", email)
      .maybeSingle();

    if (existing.error) {
      this.logger.error(
        `❌ [SUPABASE] Erro ao buscar lead_identifier: ${existing.error.message}`
      );
      return;
    }

    const leadId = existing.data?.lead_id;
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

    // Inicializa ou atualiza dados do contato no map
    if (!contactDataMap.has(email)) {
      contactDataMap.set(email, {
        email,
        identifiers: [],
        events: [],
        leadTags: [],
        tagEvents: [],
      });
    }

    const contactData = contactDataMap.get(email)!;

    if (!leadId) {
      // Novo lead - adiciona dados para criação
      // full_name é NOT NULL no banco, então garantimos uma string válida
      const cleanName = fullName && fullName.trim() ? fullName.trim() : "";
      contactData.leadData = {
        full_name: cleanName,
        first_contact_at: contactCreatedAt || new Date().toISOString(),
        last_activity_at: contactUpdatedAt || new Date().toISOString(),
      };
      report.totals.leadsUpserted++;
    } else {
      // Lead existente - adiciona atualizações
      contactData.leadId = leadId;
      contactData.leadUpdates = {};
      if (contactUpdatedAt)
        contactData.leadUpdates.last_activity_at = contactUpdatedAt;
      if (contactCreatedAt)
        contactData.leadUpdates.first_contact_at = contactCreatedAt;
      if (fullName) {
        const currentLead = await this.supabase
          .from("leads")
          .select("full_name")
          .eq("id", leadId)
          .single();
        const currentName = currentLead.data?.full_name || null;
        const bestName = chooseBetterName(currentName, fullName);
        if (bestName && bestName !== currentName) {
          contactData.leadUpdates.full_name = removeNameDuplication(bestName);
        }
      }
    }

    // Adiciona identifiers
    contactData.identifiers.push({
      type: "email",
      value: email,
      value_normalized: email,
      is_primary: true,
    });

    if (phone) {
      const phoneNorm = phone.replace(/\D+/g, "");
      if (phoneNorm) {
        contactData.identifiers.push({
          type: "phone",
          value: phone,
          value_normalized: phoneNorm,
          is_primary: false,
        });
      }
    }

    // Adiciona source
    const contactId = String(contact?.id ?? "");
    contactData.source = {
      source_ref: `contact:${contactId}`,
      first_seen_at: contactCreatedAt || new Date().toISOString(),
      last_seen_at: contactUpdatedAt || new Date().toISOString(),
      meta: c ?? {},
    };

    // Adiciona evento
    contactData.events.push({
      event_type: "contact.imported",
      occurred_at: contactCreatedAt || new Date().toISOString(),
      dedupe_key: `clint:contact:${contactId}`,
      payload: { contact_id: contactId, email, name: fullName },
    });

    // Tags (busca tag IDs)
    for (const keyRaw of tagKeys) {
      const key = keyRaw.trim();
      if (!key) continue;
      const keyNormalized = key.toLowerCase().trim();

      const tagUp = await this.supabase
        .from("tags")
        .upsert(
          { key, name: key, category: "clint", weight: 1 },
          { onConflict: "key_normalized" }
        )
        .select("id")
        .single();

      const tagId = tagUp.data?.id;
      if (!tagId) continue;

      await this.supabase
        .from("tag_aliases")
        .upsert(
          { tag_id: tagId, source_system: "clint", source_key: keyNormalized },
          { onConflict: "source_system,source_key" }
        );

      contactData.leadTags.push({
        tag_id: tagId,
        source_ref: `contact:${contactId}`,
        meta: { from: "clint.contact.tags" },
      });

      contactData.tagEvents.push({
        event_type: "tag.added",
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
        email: string;
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
    >
  ): Promise<void> {
    const BATCH_INSERT_SIZE = 100;

    // 1. Criar novos leads em batch e mapear IDs
    const newLeads: Array<{
      email: string;
      data: {
        full_name: string;
        first_contact_at: string;
        last_activity_at: string;
      };
    }> = [];
    for (const [email, data] of contactDataMap.entries()) {
      if (data.leadData && !data.leadId) {
        newLeads.push({ email, data: data.leadData });
      }
    }

    if (newLeads.length > 0) {
      const leadsToInsert = newLeads.map((l) => l.data);
      for (let i = 0; i < leadsToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = leadsToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase
          .from("leads")
          .insert(chunk)
          .select("id");

        if (result.error) {
          this.logger.error(
            `❌ [BATCH] Erro ao inserir leads: ${result.error.message}`
          );
        } else if (result.data) {
          // Mapear IDs retornados para emails
          for (
            let j = 0;
            j < result.data.length && i + j < newLeads.length;
            j++
          ) {
            const email = newLeads[i + j].email;
            const leadId = result.data[j].id;
            const contactData = contactDataMap.get(email);
            if (contactData) {
              contactData.leadId = leadId;
            }
          }
          this.logger.debug(`✅ [BATCH] ${result.data.length} leads inseridos`);
        }
      }
    }

    // 2. Atualizar leads existentes em paralelo
    const updatePromises: Array<Promise<unknown>> = [];
    for (const data of contactDataMap.values()) {
      if (data.leadId && data.leadUpdates) {
        updatePromises.push(
          Promise.resolve(
            this.supabase
              .from("leads")
              .update(data.leadUpdates)
              .eq("id", data.leadId)
          )
        );
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      this.logger.debug(
        `✅ [BATCH] ${updatePromises.length} leads atualizados`
      );
    }

    // 3. Inserir identifiers em batch
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
          .from("lead_identifiers")
          .upsert(chunk, { onConflict: "type,value_normalized" });
        if (result.error) {
          this.logger.error(
            `❌ [BATCH] Erro ao inserir identifiers: ${result.error.message}`
          );
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} identifiers inseridos`);
        }
      }
    }

    // 4. Inserir sources em batch
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
          source_system: "clint",
          ...data.source,
        });
      }
    }

    if (sourcesToInsert.length > 0) {
      for (let i = 0; i < sourcesToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = sourcesToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase
          .from("lead_sources")
          .upsert(chunk, { onConflict: "source_system,source_ref" });
        if (result.error) {
          this.logger.error(
            `❌ [BATCH] Erro ao inserir sources: ${result.error.message}`
          );
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} sources inseridos`);
        }
      }
    }

    // 5. Inserir events em batch
    // Nota: A constraint UNIQUE (source_system, dedupe_key) é parcial (apenas quando dedupe_key não é nulo)
    // O Supabase não suporta onConflict para constraints parciais, então usamos insert e ignoramos erros de duplicata
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
            source_system: "clint",
            ingested_at: new Date().toISOString(),
            ...event,
          });
        }
        for (const event of data.tagEvents) {
          eventsToInsert.push({
            lead_id: data.leadId,
            source_system: "clint",
            ingested_at: new Date().toISOString(),
            ...event,
          });
        }
      }
    }

    if (eventsToInsert.length > 0) {
      for (let i = 0; i < eventsToInsert.length; i += BATCH_INSERT_SIZE) {
        const chunk = eventsToInsert.slice(i, i + BATCH_INSERT_SIZE);
        const result = await this.supabase.from("lead_events").insert(chunk);
        if (result.error) {
          // Ignora erros de chave duplicada (evento já existe)
          if (
            result.error.message?.includes("duplicate key") ||
            result.error.message?.includes("unique constraint")
          ) {
            this.logger.debug(
              `⚠️ [BATCH] ${chunk.length} events já existiam (ignorados)`
            );
          } else {
            this.logger.error(
              `❌ [BATCH] Erro ao inserir events: ${result.error.message}`
            );
          }
        } else {
          this.logger.debug(`✅ [BATCH] ${chunk.length} events inseridos`);
        }
      }
    }

    // 6. Inserir lead_tags em batch
    // Deduplicar dentro do batch para evitar erro "cannot affect row a second time"
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
              source_system: "clint",
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
          .from("lead_tags")
          .upsert(chunk, { onConflict: "lead_id,tag_id,source_system" });
        if (result.error) {
          this.logger.error(
            `❌ [BATCH] Erro ao inserir lead_tags: ${result.error.message}`
          );
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
    dryRun: boolean
  ): Promise<void> {
    // Método mantido para compatibilidade, mas não usado mais
    // TODO: Remover após validação
    const contactDataMap = new Map();
    await this.processContactForBatch(
      c,
      contactNumber,
      totalContacts,
      report,
      dryRun,
      contactDataMap
    );
  }

  private async processDeal(
    d: unknown,
    dealNumber: number,
    totalDeals: number,
    report: ClintSyncReport,
    dryRun: boolean
  ): Promise<void> {
    const deal = d as {
      id?: string;
      origin_id?: string;
      originId?: string;
      stage_id?: string;
      stageId?: string;
      status?: "OPEN" | "WON" | "LOST" | string;
      created_at?: string;
      updated_stage_at?: string;
      won_at?: string;
      lost_at?: string;
      contact?: { email?: string };
    };

    const dealId = String(deal?.id ?? "").trim();
    if (!dealId) return;

    const emailRaw = String(deal?.contact?.email ?? "")
      .toLowerCase()
      .trim();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    if (!email) return; // Email é a única chave de deduplicação

    if (dryRun) {
      report.totals.funnelEntriesUpserted++;
      return;
    }

    // 1) Resolve lead_id por email
    const leadRes = await this.supabase
      .from("lead_identifiers")
      .select("lead_id")
      .eq("type", "email")
      .eq("value_normalized", email)
      .maybeSingle();

    const leadId = leadRes.data?.lead_id ?? null;
    if (!leadId) return;

    // 2) Resolve funnel_id por origin_id
    const originId =
      String(deal?.origin_id ?? deal?.originId ?? "").trim() || null;
    let funnelId: string | null = null;

    if (originId) {
      const alias = await this.supabase
        .from("funnel_aliases")
        .select("funnel_id")
        .eq("source_system", "clint")
        .eq("source_key", originId)
        .maybeSingle();
      funnelId = alias.data?.funnel_id ?? null;
    }

    // Fallback funnel (deals sem origin)
    if (!funnelId) {
      const fallback = await this.supabase
        .from("funnels")
        .select("id")
        .eq("key_normalized", "clint-origin-unknown")
        .maybeSingle();
      funnelId = fallback.data?.id ?? null;
    }

    if (!funnelId) return;

    // 3) Resolve current_stage_id via deal.stage_id (mapeado em origin.stages)
    const stageRef =
      String(deal?.stage_id ?? deal?.stageId ?? "").trim() || null;
    let currentStageId: string | null = null;

    if (stageRef) {
      const stageKey = `clint-stage-${stageRef}`;
      const stageKeyNorm = stageKey.toLowerCase().trim();
      const stageRow = await this.supabase
        .from("funnel_stages")
        .select("id")
        .eq("funnel_id", funnelId)
        .eq("key_normalized", stageKeyNorm)
        .maybeSingle();

      currentStageId = stageRow.data?.id ?? null;

      // Safety net: se não existir, cria uma placeholder (para não perder deal)
      if (!currentStageId) {
        const up = await this.supabase
          .from("funnel_stages")
          .upsert(
            {
              funnel_id: funnelId,
              key: stageKey,
              name: stageKey,
              position: 999,
            },
            { onConflict: "funnel_id,key_normalized" }
          )
          .select("id")
          .single();
        currentStageId = up.data?.id ?? null;
      }
    }

    // 4) Status
    const statusRaw = String(deal?.status ?? "OPEN").toUpperCase();
    const status =
      statusRaw === "WON" ? "won" : statusRaw === "LOST" ? "lost" : "open";

    // 5) Timestamps
    const createdAt = deal?.created_at
      ? new Date(deal.created_at).toISOString()
      : new Date().toISOString();
    const updatedStageAt =
      (deal?.updated_stage_at &&
        new Date(deal.updated_stage_at).toISOString()) ||
      (deal?.won_at && new Date(deal.won_at).toISOString()) ||
      (deal?.lost_at && new Date(deal.lost_at).toISOString()) ||
      new Date().toISOString();

    const externalRef = `deal:${dealId}`;

    // 6) Upsert entry + eventos de mudança
    const existingEntry = await this.supabase
      .from("lead_funnel_entries")
      .select("id, current_stage_id, status")
      .eq("source_system", "clint")
      .eq("external_ref", externalRef)
      .maybeSingle();

    if (existingEntry.data) {
      const oldStageId = existingEntry.data.current_stage_id ?? null;
      const oldStatus = existingEntry.data.status ?? null;

      await this.supabase
        .from("lead_funnel_entries")
        .update({
          lead_id: leadId,
          funnel_id: funnelId,
          current_stage_id: currentStageId,
          status,
          last_seen_at: updatedStageAt,
          meta: d ?? {},
        })
        .eq("id", existingEntry.data.id);

      // Evento: mudança de stage
      if (oldStageId !== currentStageId) {
        await this.supabase.from("lead_events").insert({
          lead_id: leadId,
          event_type: "deal.stage.changed",
          source_system: "clint",
          occurred_at: updatedStageAt,
          ingested_at: new Date().toISOString(),
          dedupe_key: `clint:deal:${dealId}:stage:${currentStageId ?? "null"}`,
          payload: {
            deal_id: dealId,
            funnel_id: funnelId,
            old_stage_id: oldStageId,
            new_stage_id: currentStageId,
          },
        });
      }

      // Evento: mudança de status
      if (oldStatus !== status) {
        await this.supabase.from("lead_events").insert({
          lead_id: leadId,
          event_type: "deal.status.changed",
          source_system: "clint",
          occurred_at: updatedStageAt,
          ingested_at: new Date().toISOString(),
          dedupe_key: `clint:deal:${dealId}:status:${status}`,
          payload: {
            deal_id: dealId,
            funnel_id: funnelId,
            old_status: oldStatus,
            new_status: status,
          },
        });
      }
    } else {
      // Novo entry
      await this.supabase.from("lead_funnel_entries").insert({
        lead_id: leadId,
        funnel_id: funnelId,
        current_stage_id: currentStageId,
        status,
        source_system: "clint",
        external_ref: externalRef,
        first_seen_at: createdAt,
        last_seen_at: updatedStageAt,
        meta: d ?? {},
      });

      // Evento: deal criado
      await this.supabase.from("lead_events").insert({
        lead_id: leadId,
        event_type: "deal.created",
        source_system: "clint",
        occurred_at: createdAt,
        ingested_at: new Date().toISOString(),
        dedupe_key: `clint:deal:${dealId}:created`,
        payload: {
          deal_id: dealId,
          funnel_id: funnelId,
          stage_id: currentStageId,
          status,
        },
      });
    }

    report.totals.funnelEntriesUpserted++;
  }
}
