export type NullableNumber = number | null | undefined;

export function intersectsOpenRange(
  profileMin: NullableNumber,
  profileMax: NullableNumber,
  filterMin?: number,
  filterMax?: number,
): boolean {
  const leftCondition =
    profileMax === null ||
    profileMax === undefined ||
    filterMin === undefined ||
    profileMax >= filterMin;
  const rightCondition =
    profileMin === null ||
    profileMin === undefined ||
    filterMax === undefined ||
    profileMin <= filterMax;

  return leftCondition && rightCondition;
}

export type OrFilterQuery<T> = {
  or: (filters: string) => T;
};

export function applyOpenRangeIntersectionFilter<T extends OrFilterQuery<T>>(
  query: T,
  columns: { profileMin: string; profileMax: string },
  filter: { min?: number; max?: number },
): T {
  let nextQuery = query;

  if (filter.min !== undefined) {
    nextQuery = nextQuery.or(
      `${columns.profileMax}.is.null,${columns.profileMax}.gte.${filter.min}`,
    );
  }

  if (filter.max !== undefined) {
    nextQuery = nextQuery.or(
      `${columns.profileMin}.is.null,${columns.profileMin}.lte.${filter.max}`,
    );
  }

  return nextQuery;
}
