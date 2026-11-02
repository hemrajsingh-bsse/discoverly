// Mirrors the search state in the query string, so any view can be refreshed, bookmarked or shared.
import { FILTER_GROUPS, SORT_OPTIONS } from './filters.js';

const OWN_KEYS = ['q', 'sort', 'page', 'show', 'saved', ...FILTER_GROUPS.map((group) => group.param)];

/** Reads and validates state from the URL. Unknown or invalid values are ignored. */
export function readUrlState({ pageSizes, search = location.search }) {
  const params = new URLSearchParams(search);
  const state = { query: params.get('q') ?? '', savedOnly: params.get('saved') === '1' };

  state.filters = Object.fromEntries(FILTER_GROUPS.map((group) => [
    group.key,
    new Set(params.getAll(group.param).filter((value) => group.options.includes(value))),
  ]));

  const sort = params.get('sort');
  if (sort && Object.hasOwn(SORT_OPTIONS, sort)) state.sort = sort;

  const pageSize = Number(params.get('show'));
  if (pageSizes.includes(pageSize)) state.pageSize = pageSize;

  const page = Number.parseInt(params.get('page'), 10);
  if (page > 1) state.page = page;

  return state;
}

/** Writes non-default values to the URL without adding history entries. Other params (like ?fail) are kept. */
export function writeUrlState(state, defaults) {
  const params = new URLSearchParams(location.search);
  OWN_KEYS.forEach((key) => params.delete(key));

  const query = state.query.trim();
  if (query) params.set('q', query);
  for (const group of FILTER_GROUPS) {
    for (const value of state.filters[group.key]) params.append(group.param, value);
  }
  if (state.sort !== defaults.sort) params.set('sort', state.sort);
  if (state.pageSize !== defaults.pageSize) params.set('show', String(state.pageSize));
  if (state.page > 1) params.set('page', String(state.page));
  if (state.savedOnly) params.set('saved', '1');

  const next = params.toString();
  if (next !== location.search.slice(1)) {
    history.replaceState(null, '', `${location.pathname}${next ? `?${next}` : ''}${location.hash}`);
  }
}
