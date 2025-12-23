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
    .replace(/\s+/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

/**
 * Detecta se um nome contém duplicação (ex: "lucas previato lucas previato")
 */
export function hasNameDuplication(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;

  const words = normalized.toLowerCase().split(/\s+/);
  if (words.length < 2) return false;

  const mid = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, mid).join(' ');
  const secondHalf = words.slice(mid).join(' ');

  if (firstHalf === secondHalf && firstHalf.length > 0) return true;

  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1]) {
      return true;
    }
  }

  if (words.length >= 4) {
    const firstTwo = words.slice(0, 2).join(' ');
    const lastTwo = words.slice(-2).join(' ');
    if (firstTwo === lastTwo) {
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

  const uniqueWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i - 1]) {
      uniqueWords.push(words[i]);
    }
  }

  let result = uniqueWords.join(' ');

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

  if (!existingNorm) {
    return incomingNorm || null;
  }

  if (!incomingNorm) {
    return existingNorm;
  }

  if (existingNorm.toLowerCase() === incomingNorm.toLowerCase()) {
    return existingNorm;
  }

  const existingHasDup = hasNameDuplication(existingNorm);
  const incomingHasDup = hasNameDuplication(incomingNorm);

  if (existingHasDup && !incomingHasDup) {
    return incomingNorm;
  }

  if (incomingHasDup && !existingHasDup) {
    return existingNorm;
  }

  if (existingHasDup && incomingHasDup) {
    const existingClean = removeNameDuplication(existingNorm);
    const incomingClean = removeNameDuplication(incomingNorm);

    if (incomingClean.length > existingClean.length) {
      return incomingClean;
    }
    return existingClean;
  }

  if (incomingNorm.length > existingNorm.length) {
    return incomingNorm;
  }

  return existingNorm;
}
