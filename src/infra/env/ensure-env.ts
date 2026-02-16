const dedupe = (names: readonly string[]) => Array.from(new Set(names));

export const ensureEnv = (names: readonly string[]) => {
  const uniqueNames = dedupe(names);
  if (uniqueNames.length === 0) return;

  const missing = uniqueNames.filter((name) => !process.env[name]);
  if (missing.length === 0) return;

  const plural = missing.length > 1 ? 'variables' : 'variable';
  throw new Error(`Missing environment ${plural}: ${missing.join(', ')}`);
};
