import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

@Injectable()
export class ClintApiClient {
  private readonly logger = new Logger(ClintApiClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    const baseURL = process.env.CLINT_BASE_URL ?? 'https://api.clint.digital/v1';
    const token = process.env.CLINT_API_TOKEN;
    const header = process.env.CLINT_API_HEADER ?? 'api-token';

    if (!token) {
      throw new Error('CLINT_API_TOKEN não configurado no .env');
    }

    this.http = axios.create({
      baseURL,
      headers: {
        [header]: token,
        accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  async listAll<T = unknown>(path: string, maxPages?: number): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    let hasNext = true;
    const limitPages = maxPages ?? Infinity; // Limite de páginas (undefined = todas)

    // A API do Clint retorna: { status, totalCount, page, totalPages, hasNext, hasPrevious, data: [...] }
    while (hasNext && page <= limitPages) {
      const res = await this.http.get(path, { params: { page, limit: 200 } });
      const body = res.data as {
        status?: number;
        totalCount?: number;
        page?: number;
        totalPages?: number;
        hasNext?: boolean;
        hasPrevious?: boolean;
        data?: T[];
      };

      // A API do Clint retorna os dados em body.data
      const items: T[] = body?.data ?? [];
      
      if (!items.length) {
        hasNext = false;
        break;
      }

      all.push(...items);

      this.logger.debug(
        `Página ${page}/${body?.totalPages ?? '?'}: ${items.length} itens (total acumulado: ${all.length})`,
      );

      // Usa hasNext da resposta da API do Clint
      hasNext = body?.hasNext === true;

      // Fallback: se não tiver hasNext, verifica se há mais páginas
      if (!hasNext && body?.totalPages && body?.page) {
        hasNext = body.page < body.totalPages;
      }

      page++;

      // Safety: evita loop infinito
      if (page > 1000) {
        console.warn(`[ClintApiClient] Limite de 1000 páginas atingido para ${path}`);
        break;
      }
    }

    return all;
  }

  async getPage<T = unknown>(path: string, page: number, limit = 200): Promise<{
    data: T[];
    page: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
  }> {
    const res = await this.http.get(path, { params: { page, limit } });
    const body = res.data as {
      status?: number;
      totalCount?: number;
      page?: number;
      totalPages?: number;
      hasNext?: boolean;
      hasPrevious?: boolean;
      data?: T[];
    };

    const items: T[] = body?.data ?? [];
    const totalPages = body?.totalPages ?? 1;
    const totalCount = body?.totalCount ?? items.length;
    const currentPage = body?.page ?? page;
    const hasNext = body?.hasNext ?? (currentPage < totalPages);

    return {
      data: items,
      page: currentPage,
      totalPages,
      totalCount,
      hasNext,
    };
  }

  tags() {
    return this.listAll('/tags');
  }

  contacts(maxPages?: number) {
    return this.listAll('/contacts', maxPages);
  }

  contactsPage(page: number, limit = 200) {
    return this.getPage('/contacts', page, limit);
  }

  deals() {
    return this.listAll('/deals');
  }

  origins() {
    return this.listAll('/origins');
  }

  groups() {
    return this.listAll('/groups');
  }

  lostStatus() {
    return this.listAll('/lost-status');
  }
}

