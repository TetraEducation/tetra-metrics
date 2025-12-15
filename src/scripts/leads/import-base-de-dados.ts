import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { Presets, SingleBar } from 'cli-progress';

import { AppModule } from '@/app.module';
import type { ImportLeadInput } from '@/modules/leads/application/dto/import-lead.input';
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';

const logger = new Logger('LeadsSheetsImporter');

const BASE_SHEETS_PATH = path.resolve(process.cwd(), 'folders', 'sheets', 'BASE DE DADOS');
const SUPPORTED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

type SheetRow = Record<string, unknown>;

// Priorizar matches exatos ou que começam com a palavra-chave
const emailKeys = ['email', 'e-mail'];
const phoneKeys = ['número de telefone', 'numero de telefone', 'telefone', 'phone', 'celular', 'whatsapp', 'numero', 'número', 'num', 'tel'];
// Remover 'lista de nomes' - ela contém nomes de campanhas, não nomes de pessoas
const directNameKeys = ['nome completo', 'full name', 'full_name'];
const firstNameKeys = ['nome']; // Priorizar coluna "Nome" exata
const lastNameKeys = ['sobrenome', 'ultimo nome', 'last name', 'surname'];
const sourceKeys = ['utm source', 'source', 'fonte', 'origem', 'campanha'];

const normalizeKey = (key: string) =>
  key.replace(/[_*\-\s]+/g, '').trim().toLowerCase();

const normalizeString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^(null|undefined|n\/a|na|não informado)$/i.test(text)) return null;
  return text;
};

const isValidEmail = (email: string | null): boolean => {
  if (!email) return false;
  // Regex simples mas efetivo para emails
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  // Remove caracteres não numéricos e verifica se tem pelo menos 8 dígitos
  const digits = phone.replace(/\D+/g, '');
  return digits.length >= 8;
};

const isValidName = (name: string | null): boolean => {
  if (!name) return false;
  // Rejeita nomes muito curtos (menos de 2 caracteres) ou que são apenas números
  if (name.length < 2) return false;
  if (/^\d+$/.test(name)) return false;
  // Rejeita nomes que são claramente não-nomes (contém apenas caracteres especiais)
  if (!/[a-zA-ZÀ-ÿ]/.test(name)) return false;
  // Rejeita emails - se contém @ e domínio, é um email, não um nome
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return false;
  // Rejeita valores que parecem ser emails mesmo sem validação completa
  if (name.includes('@') && name.includes('.')) return false;
  return true;
};

const matchValue = (row: SheetRow, keys: string[]) => {
  const normalizedRowEntries = Object.entries(row).map(([key, value]) => [
    normalizeKey(key),
    value,
  ]) as Array<[string, unknown]>;
  
  // Primeiro tenta match exato
  for (const candidate of keys) {
    const exactMatch = normalizedRowEntries.find(
      ([normalizedKey]) => normalizedKey === candidate,
    );
    if (exactMatch) return exactMatch[1];
  }
  
  // Depois tenta match que começa com a palavra-chave
  for (const candidate of keys) {
    const startsWithMatch = normalizedRowEntries.find(([normalizedKey]) =>
      normalizedKey.startsWith(candidate),
    );
    if (startsWithMatch) return startsWithMatch[1];
  }
  
  // Por último, fallback para includes (menos específico)
  for (const candidate of keys) {
    const includesMatch = normalizedRowEntries.find(([normalizedKey]) =>
      normalizedKey.includes(candidate),
    );
    if (includesMatch) return includesMatch[1];
  }
  
  return undefined;
};

const extractName = (row: SheetRow): string | null => {
  // Priorizar "Nome" + "Sobrenome" (mais confiável nas planilhas)
  const first = normalizeString(matchValue(row, firstNameKeys));
  const last = normalizeString(matchValue(row, lastNameKeys));
  if (first || last) {
    const fullName = [first, last].filter(Boolean).join(' ');
    // Validar que não é um email antes de retornar
    if (fullName && !isValidEmail(fullName) && !fullName.includes('@')) {
      return fullName;
    }
  }

  // Fallback para colunas de nome completo
  const direct = normalizeString(matchValue(row, directNameKeys));
  // Validação: rejeitar valores que parecem ser nomes de listas/campanhas
  if (direct && /^(black|lista|campanha|geral|mba|tetra|club|bf|bfmba|bftc)/i.test(direct)) {
    return null;
  }
  // Validação: rejeitar se for um email
  if (direct && (isValidEmail(direct) || direct.includes('@'))) {
    return null;
  }
  return direct;
};

const toLeadInput = (row: SheetRow, sourceHint: string): ImportLeadInput => {
  const rawEmail = normalizeString(matchValue(row, emailKeys));
  const rawPhone = normalizeString(matchValue(row, phoneKeys));
  const rawName = extractName(row);
  
  // Validar e limpar valores
  const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
  const phone = rawPhone && isValidPhone(rawPhone) ? rawPhone : null;
  
  // Validação extra: garantir que nome não é um email
  let name: string | null = null;
  if (rawName && isValidName(rawName)) {
    // Verificação final: se o nome for igual ao email, rejeitar
    if (email && rawName.toLowerCase() === email.toLowerCase()) {
      name = null;
    } else if (!isValidEmail(rawName) && !rawName.includes('@')) {
      name = rawName;
    }
  }
  
  return {
    email,
    phone,
    name,
    source: normalizeString(matchValue(row, sourceKeys)) ?? sourceHint,
  };
};

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectFiles(entryPath);
        files.push(...nested);
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    }),
  );
  return files.sort();
}

const readSheetRows = (filePath: string): SheetRow[] => {
  try {
    const workbook = XLSX.readFile(filePath, { 
      cellDates: false,
    });
    const rows: SheetRow[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Sem header especificado, o XLSX usa automaticamente a primeira linha como cabeçalho
      // e cria objetos com propriedades nomeadas {Email: "...", Nome: "..."}
      const json = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
        defval: null,
        raw: false,
        blankrows: false,
        // Padrão: primeira linha vira cabeçalho, cria objetos nomeados
      });
      rows.push(...json);
    }
    return rows;
  } catch (error) {
    throw new Error(
      `❌ ERRO CRÍTICO: Falha ao ler arquivo "${filePath}": ${(error as Error).message}`,
    );
  }
};

const sanitizeCsv = (value: string | null | undefined) => {
  if (!value) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
};

async function run() {
  logger.log(`Lendo planilhas em ${BASE_SHEETS_PATH}`);
  const files = await collectFiles(BASE_SHEETS_PATH);
  if (files.length === 0) {
    logger.warn('Nenhuma planilha encontrada.');
    return;
  }

  logger.log(`Encontrados ${files.length} arquivos. Iniciando bootstrap Nest...`);
  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const leadsImportService = ctx.get(LeadsImportService, { strict: false });

  const progressBar = new SingleBar(
    {
      format:
        'Importando {bar} {percentage}% | {value}/{total} linhas | sucesso: {success} falhas: {failures} pulados: {skipped}',
    },
    Presets.shades_classic,
  );
  const resultsCsvPath = path.resolve(process.cwd(), 'processed-leads.csv');
  const resultsStream = createWriteStream(resultsCsvPath, { flags: 'w' });
  resultsStream.write('file,row,email,phone,leadId,status,message\n');

  let totalRows = 0;
  let successes = 0;
  let failures = 0;
  let skipped = 0;
  let progressStarted = false;

  for (const [fileIndex, file] of files.entries()) {
    try {
      logger.log(`Processando ${file}`);
      const rows = readSheetRows(file);
      const sourceHint = path.relative(BASE_SHEETS_PATH, file);
      
      // Validação crítica: verificar se as colunas essenciais foram detectadas
      if (fileIndex === 0 && rows.length > 0) {
        const firstRow = rows[0];
        const columns = Object.keys(firstRow);
        logger.log(`Colunas detectadas (primeiro arquivo): ${columns.join(', ')}`);
        
        // Validar se encontrou pelo menos uma coluna de email ou telefone
        const normalizedColumns = columns.map((col) => normalizeKey(col));
        const hasEmail = normalizedColumns.some((col) => emailKeys.some((key) => col.includes(key)));
        const hasPhone = normalizedColumns.some((col) => phoneKeys.some((key) => col.includes(key)));
        
        if (!hasEmail && !hasPhone) {
          throw new Error(
            `❌ ERRO CRÍTICO: Não foi possível detectar colunas de Email ou Telefone no primeiro arquivo.\n` +
            `   Colunas encontradas: ${columns.join(', ')}\n` +
            `   O script precisa de pelo menos uma coluna de Email ou Telefone para funcionar.`,
          );
        }
        
        if (!hasEmail) {
          logger.warn('⚠️  AVISO: Coluna de Email não detectada. Apenas telefones serão processados.');
        }
        if (!hasPhone) {
          logger.warn('⚠️  AVISO: Coluna de Telefone não detectada. Apenas emails serão processados.');
        }
      }

      totalRows += rows.length;
      if (!progressStarted) {
        progressBar.start(Math.max(totalRows, 1), 0, {
          success: 0,
          failures: 0,
          skipped: 0,
        });
        progressStarted = true;
      } else {
        progressBar.setTotal(Math.max(totalRows, 1));
      }

      for (const [index, row] of rows.entries()) {
        const payload = toLeadInput(row, sourceHint);
        const rowNumber = index + 2;
        
        // Pequeno delay para evitar rate limiting (10ms entre requisições)
        if (index > 0 && (successes + failures) % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        
        if (!payload.email && !payload.phone) {
          skipped += 1;
          // Determinar motivo específico do skip
          const rawEmail = normalizeString(matchValue(row, emailKeys));
          const rawPhone = normalizeString(matchValue(row, phoneKeys));
          let skipReason = 'missing identifiers';
          if (!rawEmail && !rawPhone) {
            skipReason = 'email and phone not found in row';
          } else if (rawEmail && !isValidEmail(rawEmail)) {
            skipReason = rawPhone && !isValidPhone(rawPhone)
              ? 'invalid email and invalid phone'
              : 'invalid email format';
          } else if (rawPhone && !isValidPhone(rawPhone)) {
            skipReason = 'invalid phone (less than 8 digits)';
          }
          
          resultsStream.write(
            `${[
              sanitizeCsv(sourceHint),
              rowNumber,
              sanitizeCsv(rawEmail ?? ''),
              sanitizeCsv(rawPhone ?? ''),
              '',
              'skipped',
              sanitizeCsv(skipReason),
            ].join(',')}\n`,
          );
          progressBar.increment(1, { success: successes, failures, skipped });
          continue;
        }

        // Retry logic para erros de rede
        let retries = 0;
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        while (retries <= maxRetries) {
          try {
            const lead = await leadsImportService.findOrCreateLeadByIdentifiers(payload);
            successes += 1;
            resultsStream.write(
              `${[
                sanitizeCsv(sourceHint),
                rowNumber,
                sanitizeCsv(payload.email),
                sanitizeCsv(payload.phone),
                sanitizeCsv(lead.id),
                'success',
                '',
              ].join(',')}\n`,
            );
            break; // Sucesso, sai do loop
          } catch (error) {
            lastError = error as Error;
            const errorMessage = lastError.message;
            const errorName = lastError.name;
            
            // Verificar se é erro de rede que pode ser retentado
            const isNetworkError = 
              errorName === 'TypeError' && errorMessage.includes('fetch failed') ||
              errorMessage.includes('network') ||
              errorMessage.includes('timeout') ||
              errorMessage.includes('ETIMEDOUT');
            
            // Se não for erro de rede ou já esgotou retries, trata como erro final
            if (!isNetworkError || retries >= maxRetries) {
              // Move para o tratamento de erro abaixo
              break;
            }
            
            // Backoff exponencial: 50ms, 100ms, 200ms
            const delay = 50 * Math.pow(2, retries);
            await new Promise((resolve) => setTimeout(resolve, delay));
            retries++;
          }
        }
        
        // Se ainda tem erro após retries, trata como falha
        if (lastError) {
          const error = lastError;
          const errorMessage = (error as Error).message;
          const errorName = (error as Error).name;
          
          // Erros críticos de conexão/banco devem interromper
          if (
            errorMessage.includes('connection') ||
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('permission denied') ||
            errorMessage.includes('Cannot read properties')
          ) {
            if (progressStarted) progressBar.stop();
            await new Promise((resolve) => resultsStream.end(resolve));
            await ctx.close();
            throw new Error(
              `❌ ERRO CRÍTICO: Falha na conexão/banco de dados ao processar lead.\n` +
              `   Arquivo: ${path.basename(file)}\n` +
              `   Linha: ${rowNumber}\n` +
              `   Erro: ${errorMessage}\n` +
              `   Verifique as configurações do Supabase (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).`,
            );
          }
          
          // Erros de fetch/network - pode ser rate limiting ou timeout
          const isNetworkError = 
            errorName === 'TypeError' && errorMessage.includes('fetch failed') ||
            errorMessage.includes('network') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('ETIMEDOUT');
          
          failures += 1;
          // Mostrar apenas o nome do arquivo, não o caminho completo
          const fileName = path.basename(file);
          const detailedError = isNetworkError
            ? `${errorMessage} (tentativas: ${retries}/${maxRetries})`
            : errorMessage;
          
          logger.error(
            `Falha: ${fileName}:${rowNumber} - ${detailedError}`,
          );
          resultsStream.write(
            `${[
              sanitizeCsv(sourceHint),
              rowNumber,
              sanitizeCsv(payload.email),
              sanitizeCsv(payload.phone),
              '',
              'error',
              sanitizeCsv(detailedError),
            ].join(',')}\n`,
          );
        }
        
        progressBar.increment(1, { success: successes, failures, skipped });
      }
    } catch (error) {
      // Erro ao processar arquivo - interromper
      if (progressStarted) progressBar.stop();
      await new Promise((resolve) => resultsStream.end(resolve));
      await ctx.close();
      throw error; // Re-lança o erro para ser capturado pelo catch principal
    }
  }

  if (progressStarted) progressBar.stop();
  await new Promise((resolve) => resultsStream.end(resolve));

  logger.log(
    `Importação concluída. Sucesso: ${successes}, falhas: ${failures}, pulados: ${skipped}. CSV: ${resultsCsvPath}`,
  );
  await ctx.close();
}

run().catch((error) => {
  const errorMessage = (error as Error).message;
  const errorStack = (error as Error).stack;
  
  console.error('\n' + '='.repeat(80));
  console.error('❌ ERRO CRÍTICO: Importação interrompida');
  console.error('='.repeat(80));
  console.error(`\nMotivo: ${errorMessage}\n`);
  
  if (errorStack && errorStack !== errorMessage) {
    console.error('Stack trace:');
    console.error(errorStack);
  }
  
  console.error('\n' + '='.repeat(80));
  console.error('Ação: Corrija o erro acima e execute novamente o script.\n');
  
  process.exit(1);
});


