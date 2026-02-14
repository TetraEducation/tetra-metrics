export const V1_DEPRECATION_HEADERS = {
  deprecationDate: '2026-02-14',
  sunsetHttpDate: 'Fri, 14 Aug 2026 00:00:00 GMT',
  migrationDocUrl: 'https://docs.tetraeducacao.com/tetra-metrics/migracao-v1-v2',
} as const;

const V1_DEPRECATED_ROUTE_REGEXES = [
  /^\/leads\/import-one$/,
  /^\/leads\/search$/,
  /^\/leads\/[^/]+\/details$/,
  /^\/imports\/spreadsheet$/,
] as const;

export function isDeprecatedV1Route(routePath: string): boolean {
  const normalizedPath = normalizePath(routePath);
  return V1_DEPRECATED_ROUTE_REGEXES.some((routeRegex) => routeRegex.test(normalizedPath));
}

function normalizePath(routePath: string): string {
  const [withoutQuery] = routePath.split('?');
  if (!withoutQuery) {
    return '/';
  }

  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}
