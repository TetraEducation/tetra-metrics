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
 * Calcula similaridade entre duas palavras usando Levenshtein simplificado
 * Retorna um valor entre 0 (diferentes) e 1 (iguais)
 */
function wordSimilarity(word1: string, word2: string): number {
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();

  if (w1 === w2) return 1.0;
  if (w1.length === 0 || w2.length === 0) return 0.0;

  // Se uma palavra começa com a outra (abreviação)
  if (w1.startsWith(w2) || w2.startsWith(w1)) {
    const minLen = Math.min(w1.length, w2.length);
    const maxLen = Math.max(w1.length, w2.length);
    return minLen / maxLen;
  }

  // Distância de Levenshtein simplificada
  const maxLen = Math.max(w1.length, w2.length);
  let distance = 0;

  for (let i = 0; i < Math.min(w1.length, w2.length); i++) {
    if (w1[i] !== w2[i]) {
      distance++;
    }
  }
  distance += Math.abs(w1.length - w2.length);

  return 1 - distance / maxLen;
}

/**
 * Verifica se um nome é uma versão abreviada do outro
 */
function isAbbreviationOf(abbreviated: string, full: string): boolean {
  const abbrevWords = abbreviated.toLowerCase().split(/\s+/);
  const fullWords = full.toLowerCase().split(/\s+/);

  if (abbrevWords.length > fullWords.length) return false;

  let abbrevIndex = 0;
  for (let i = 0; i < fullWords.length && abbrevIndex < abbrevWords.length; i++) {
    const abbrevWord = abbrevWords[abbrevIndex];
    const fullWord = fullWords[i];

    // Se a palavra abreviada é uma letra única e a palavra completa começa com ela
    if (abbrevWord.length === 1 && fullWord.startsWith(abbrevWord)) {
      abbrevIndex++;
    }
    // Se as palavras são similares (fuzzy match)
    else if (wordSimilarity(abbrevWord, fullWord) > 0.7) {
      abbrevIndex++;
    }
    // Se a palavra abreviada está contida na palavra completa
    else if (fullWord.includes(abbrevWord) && abbrevWord.length >= 2) {
      abbrevIndex++;
    }
  }

  return abbrevIndex === abbrevWords.length;
}

/**
 * Compara similaridade entre dois nomes completos
 * Retorna um valor entre 0 (diferentes) e 1 (muito similares)
 */
function namesSimilarity(name1: string, name2: string): number {
  const words1 = name1.toLowerCase().split(/\s+/);
  const words2 = name2.toLowerCase().split(/\s+/);

  if (words1.length === 0 || words2.length === 0) return 0;

  let totalSimilarity = 0;
  let matches = 0;

  for (const word1 of words1) {
    let bestMatch = 0;
    for (const word2 of words2) {
      const similarity = wordSimilarity(word1, word2);
      if (similarity > bestMatch) {
        bestMatch = similarity;
      }
    }
    if (bestMatch > 0.5) {
      totalSimilarity += bestMatch;
      matches++;
    }
  }

  // Considera similaridade se pelo menos 50% das palavras têm match
  if (matches < Math.ceil(words1.length / 2)) return 0;

  return totalSimilarity / words1.length;
}

/**
 * Compara dois nomes e retorna o melhor (mais completo, sem duplicação)
 * Agora com detecção de abreviações e fuzzy matching
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

  // Verifica se um nome é abreviação do outro
  const incomingIsAbbrev = isAbbreviationOf(incomingNorm, existingNorm);
  const existingIsAbbrev = isAbbreviationOf(existingNorm, incomingNorm);

  if (incomingIsAbbrev && !existingIsAbbrev) {
    return existingNorm; // Prefere o nome completo
  }

  if (existingIsAbbrev && !incomingIsAbbrev) {
    return incomingNorm; // Prefere o nome completo
  }

  // Se são similares (fuzzy match), prefere o mais longo
  const similarity = namesSimilarity(existingNorm, incomingNorm);
  if (similarity > 0.6) {
    if (incomingNorm.length > existingNorm.length) {
      return incomingNorm;
    }
    return existingNorm;
  }

  // Se não são similares, prefere o mais longo (mais completo)
  if (incomingNorm.length > existingNorm.length) {
    return incomingNorm;
  }

  return existingNorm;
}
