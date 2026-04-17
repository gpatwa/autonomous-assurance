/**
 * Shared page / cursor shapes. Used by:
 *   - Graph pager (wraps $nextLink into a cursor)
 *   - API list responses (meta.page)
 *   - Internal storage queries
 *
 * The canonical transport form on the wire uses an opaque string cursor.
 */

export interface PageMeta {
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
  pageIndex: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}
