import emojiRegex from 'emoji-regex';

const EMOJI_REGEX = emojiRegex();

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
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .replace(/-+/g, '-');
}

export function purgeEmoji(v?: unknown): string | null {
  if (v == null) return null;
  const cleaned = String(v)
    .replace(EMOJI_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length ? cleaned : null;
}

