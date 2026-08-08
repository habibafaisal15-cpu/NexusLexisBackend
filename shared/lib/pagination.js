export const PAGINATION_LIMITS = [6, 12, 24, 48];
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 48;

export function parsePagination(query = {}) {
  let page = Number.parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  } else if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!PAGINATION_LIMITS.includes(limit)) {
    limit = PAGINATION_LIMITS.reduce((best, allowed) => (
      Math.abs(allowed - limit) < Math.abs(best - limit) ? allowed : best
    ), DEFAULT_LIMIT);
  }

  return { page, limit };
}

export function buildPaginationMeta({ page, limit, totalItems }) {
  const total = Number(totalItems) || 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage = totalPages > 0 && page > totalPages ? totalPages : page;

  return {
    page: safePage,
    limit,
    totalItems: total,
    totalPages,
    hasNext: totalPages > 0 && safePage < totalPages,
    hasPrev: safePage > 1 && totalPages > 0,
    offset: total === 0 ? 0 : (safePage - 1) * limit,
  };
}
