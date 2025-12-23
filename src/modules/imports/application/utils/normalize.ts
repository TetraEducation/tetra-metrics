export function normalizeEmail(v?: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeText(v?: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function fileBaseName(originalName: string): string {
  return originalName.replace(/\.[^/.]+$/, '').trim();
}

export function normalizeKey(input: string): string {
  return input
    .trim()
    .normalize('NFKD') // separa acentos dos caracteres base
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos)
    .toLowerCase()
    .replace(/&/g, ' e ') // substitui & por " e "
    .replace(/[^a-z0-9]+/g, '-') // tudo que não é ASCII alfanumérico vira hífen
    .replace(/(^-|-$)+/g, '') // remove hífens nas pontas
    .replace(/-+/g, '-'); // colapsa múltiplos hífens em um só
}
