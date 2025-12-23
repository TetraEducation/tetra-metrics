export function pickEmail(contact: unknown): string | null {
  const raw =
    (contact as { email?: string })?.email ??
    (contact as { emails?: Array<{ email?: string }> })?.emails?.[0]?.email ??
    (contact as { emails?: string[] })?.emails?.[0] ??
    null;

  if (!raw || typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function pickName(contact: unknown): string {
  const c = contact as {
    name?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };

  return (
    c?.name ??
    c?.full_name ??
    [c?.first_name, c?.last_name].filter(Boolean).join(' ') ??
    ''
  ).trim();
}

export function pickPhone(contact: unknown): string | null {
  const c = contact as {
    phone?: string;
    mobile?: string;
    phones?: Array<{ phone?: string } | string>;
  };

  const raw =
    c?.phone ??
    c?.mobile ??
    (Array.isArray(c?.phones)
      ? typeof c.phones[0] === 'string'
        ? c.phones[0]
        : c.phones[0]?.phone
      : null) ??
    null;

  if (!raw) return null;
  return String(raw).trim() || null;
}

export function pickTagKeys(contact: unknown): string[] {
  const c = contact as {
    tags?: Array<{ name?: string; key?: string; title?: string } | string>;
    tag?: Array<{ name?: string; key?: string; title?: string } | string> | string;
    tag_ids?: Array<string | number>;
  };

  const tags = c?.tags ?? c?.tag ?? c?.tag_ids ?? [];
  if (!tags) return [];

  if (Array.isArray(tags)) {
    return tags
      .map((t) => (typeof t === 'string' ? t : (t?.name ?? t?.key ?? t?.title ?? '')))
      .map((s) => String(s).trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    return [tags.trim()].filter(Boolean);
  }

  return [];
}
