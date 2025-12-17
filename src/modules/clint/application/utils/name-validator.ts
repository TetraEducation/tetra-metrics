/**
 * Utilitários para validação e normalização de nomes
 * Previne duplicações e mantém o melhor nome disponível
 */

/**
 * Normaliza um nome removendo espaços extras e duplicações
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ') // Remove espaços múltiplos
    .replace(/\s{2,}/g, ' '); // Garante apenas um espaço
}

/**
 * Detecta se um nome contém duplicação (ex: "lucas previato lucas previato")
 */
export function hasNameDuplication(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;

  const words = normalized.toLowerCase().split(/\s+/);
  if (words.length < 2) return false;

  // Verifica se a primeira metade é igual à segunda metade
  const mid = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, mid).join(' ');
  const secondHalf = words.slice(mid).join(' ');

  if (firstHalf === secondHalf && firstHalf.length > 0) return true;

  // Verifica duplicação de palavras consecutivas idênticas
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1]) {
      return true;
    }
  }

  // Verifica padrões repetitivos maiores (ex: "lucas previato lucas previato")
  if (words.length >= 4) {
    const firstTwo = words.slice(0, 2).join(' ');
    const lastTwo = words.slice(-2).join(' ');
    if (firstTwo === lastTwo) {
      // Verifica se o meio também repete
      const middle = words.slice(2, -2).join(' ');
      if (middle === firstTwo || middle === '') return true;
    }
  }

  return false;
}

/**
 * Remove duplicações de um nome
 */
export function removeNameDuplication(name: string): string {
  const normalized = normalizeName(name);
  if (!normalized) return '';

  const words = normalized.split(/\s+/);
  if (words.length < 2) return normalized;

  // Remove palavras duplicadas consecutivas
  const uniqueWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i - 1]) {
      uniqueWords.push(words[i]);
    }
  }

  let result = uniqueWords.join(' ');

  // Verifica se a primeira metade é igual à segunda metade
  const mid = Math.floor(result.length / 2);
  const firstHalf = result.substring(0, mid).trim();
  const secondHalf = result.substring(mid).trim();

  if (firstHalf.toLowerCase() === secondHalf.toLowerCase() && firstHalf.length > 0) {
    result = firstHalf;
  }

  return normalizeName(result);
}

/**
 * Compara dois nomes e retorna o melhor (mais completo, sem duplicação)
 */
export function chooseBetterName(existing: string | null, incoming: string | null): string | null {
  const existingNorm = normalizeName(existing);
  const incomingNorm = normalizeName(incoming);

  // Se não há nome existente, retorna o novo (se válido)
  if (!existingNorm) {
    return incomingNorm || null;
  }

  // Se não há nome novo, mantém o existente
  if (!incomingNorm) {
    return existingNorm;
  }

  // Se são iguais (ignorando case), mantém o existente
  if (existingNorm.toLowerCase() === incomingNorm.toLowerCase()) {
    return existingNorm;
  }

  // Verifica duplicações
  const existingHasDup = hasNameDuplication(existingNorm);
  const incomingHasDup = hasNameDuplication(incomingNorm);

  // Se o existente tem duplicação e o novo não, usa o novo
  if (existingHasDup && !incomingHasDup) {
    return incomingNorm;
  }

  // Se o novo tem duplicação e o existente não, mantém o existente
  if (incomingHasDup && !existingHasDup) {
    return existingNorm;
  }

  // Se ambos têm duplicação, remove duplicação de ambos e compara
  if (existingHasDup && incomingHasDup) {
    const existingClean = removeNameDuplication(existingNorm);
    const incomingClean = removeNameDuplication(incomingNorm);

    // Prefere o mais longo (geralmente mais completo)
    if (incomingClean.length > existingClean.length) {
      return incomingClean;
    }
    return existingClean;
  }

  // Se nenhum tem duplicação, prefere o mais longo (mais completo)
  if (incomingNorm.length > existingNorm.length) {
    return incomingNorm;
  }

  // Por padrão, mantém o existente (já validado)
  return existingNorm;
}

