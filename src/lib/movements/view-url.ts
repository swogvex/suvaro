/**
 * Keeps the filters in the address bar (bookmarkable, survives reload) and in the List · Calendar links,
 * without adding a history entry per click.
 */
import { filtersToParams, type Filters } from './filters';

export function syncUrl(filters: Filters, extra: Record<string, string> = {}): void {
  const params = filtersToParams(filters);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.size > 0 ? `?${params}` : '';
  history.replaceState(history.state, '', `${location.pathname}${query}`);

  // The view links carry the filters only (the calendar month is the calendar's own).
  const filterQuery = filtersToParams(filters).toString();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-view-link]')) {
    const url = new URL(link.href);
    url.search = filterQuery;
    link.href = `${url.pathname}${url.search}`;
  }
}
