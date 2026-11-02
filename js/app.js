// Entry point: owns the application state, wires up events and decides when to render.
// Logic lives in filters.js, rendering in ui.js, data loading in data.js.
import { loadListings } from './data.js';
import { DEFAULT_SORT, SORT_OPTIONS, countActiveFilters, emptyFilters, runPipeline } from './filters.js';
import { createBookmarkStore } from './bookmarks.js';
import { readUrlState, writeUrlState } from './url-state.js';
import { debounce, plural } from './utils.js';
import * as ui from './ui.js';

const PAGE_SIZES = [6, 9, 12];
const SEARCH_DEBOUNCE_MS = 200;
const POPULAR_SEARCHES = ['React', 'Figma', 'Python', 'SQL', 'Remote'];
const desktop = window.matchMedia('(min-width: 961px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const { $ } = ui;
const dom = {
  search: $('#search'),
  searchForm: $('#search-form'),
  searchClear: $('#search-clear'),
  filtersPanel: $('#filters-panel'),
  filterGroups: $('#filter-groups'),
  filtersBackdrop: $('#filters-backdrop'),
  filtersOpen: $('#filters-open'),
  filtersBadge: $('#filters-badge'),
  resetFilters: $('#reset-filters'),
  showResults: $('#show-results'),
  results: $('#results'),
  summary: $('#results-summary'),
  activeTags: $('#active-tags'),
  sort: $('#sort'),
  pageSize: $('#page-size'),
  grid: $('#grid'),
  pagination: $('#pagination'),
  savedToggle: $('#saved-toggle'),
  dialog: $('#details'),
};

const DEFAULTS = { query: '', sort: DEFAULT_SORT, page: 1, pageSize: 9, savedOnly: false };
const bookmarks = createBookmarkStore('discoverly:bookmarks');

const state = {
  status: 'loading', // loading | ready | error
  listings: [],
  ...DEFAULTS,
  filters: emptyFilters(),
  ...readUrlState({ pageSizes: PAGE_SIZES }),
};

/* ---------- Rendering ---------- */

function render() {
  ui.renderSavedToggle(dom.savedToggle, bookmarks.size, state.savedOnly);
  if (state.status !== 'ready') return;

  const result = runPipeline(state.listings, { ...state, savedIds: bookmarks.ids });
  const activeCount = countActiveFilters(state.filters);
  state.page = result.pagination.page; // clamp out-of-range pages (e.g. from the URL)

  ui.syncFilterGroups(dom.filterGroups, state.filters, result.facets);
  ui.renderActiveTags(dom.activeTags, state);
  ui.renderSummary(dom.summary, result);
  dom.filtersBadge.textContent = activeCount;
  dom.filtersBadge.hidden = activeCount === 0;
  dom.resetFilters.hidden = activeCount === 0;
  dom.showResults.textContent = result.total ? `Show ${plural(result.total, 'result')}` : 'No results — adjust filters';
  dom.searchClear.hidden = !dom.search.value;

  if (result.total === 0) {
    ui.showView('empty');
    ui.renderEmpty({ query: state.query, activeCount, savedOnly: state.savedOnly });
  } else {
    ui.showView('list');
    ui.renderCards(dom.grid, result.items, { terms: result.terms, savedIds: bookmarks.ids });
    ui.renderPagination(dom.pagination, result.pagination);
  }
  writeUrlState(state, DEFAULTS);
}

/** Applies a state change and re-renders. Any change to what is shown starts again from page 1. */
function update(changes) {
  Object.assign(state, changes, { page: 1 });
  render();
}

async function load() {
  state.status = 'loading';
  ui.showView('loading');
  ui.renderSkeletons(dom.grid, state.pageSize);
  dom.summary.textContent = 'Loading opportunities…';
  try {
    state.listings = await loadListings();
    bookmarks.retain(new Set(state.listings.map((listing) => listing.id)));
    state.status = 'ready';
    ui.renderHeroStats(state.listings);
    render();
  } catch (error) {
    console.error(error);
    state.status = 'error';
    ui.showView('error');
    ui.renderError(error.message);
    dom.summary.textContent = 'Opportunities could not be loaded';
  }
}

/* ---------- Actions ---------- */

const applySearch = debounce((value) => update({ query: value }), SEARCH_DEBOUNCE_MS);

function setQuery(value) {
  applySearch.cancel();
  dom.search.value = value;
  update({ query: value });
}

function toggleFilter(group, value) {
  const selected = state.filters[group];
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  update({});
}

function clearAll() {
  applySearch.cancel();
  dom.search.value = '';
  update({ query: '', filters: emptyFilters(), savedOnly: false });
}

function toggleBookmark(id) {
  const listing = state.listings.find((item) => item.id === id);
  if (!listing) return;
  const saved = bookmarks.toggle(id);
  ui.syncBookmarkButtons(id, saved);
  ui.toast(saved ? `Saved “${listing.title}”` : `Removed “${listing.title}” from saved`);
  if (state.savedOnly) render(); // the list itself changes
  else ui.renderSavedToggle(dom.savedToggle, bookmarks.size, state.savedOnly);
}

function openDetails(id) {
  const listing = state.listings.find((item) => item.id === id);
  if (listing) ui.openDetails(dom.dialog, listing, bookmarks.has(id));
}

function scrollToResults() {
  dom.results.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
}

function goToPage(page) {
  state.page = page;
  render();
  scrollToResults();
  dom.results.focus({ preventScroll: true });
}

function setDrawer(open) {
  const isOpen = dom.filtersPanel.classList.contains('is-open');
  if (open === isOpen || (open && desktop.matches)) return;
  dom.filtersPanel.classList.toggle('is-open', open);
  dom.filtersBackdrop.hidden = !open;
  dom.filtersOpen.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('no-scroll', open);
  if (open) dom.filtersPanel.querySelector('.filters__close').focus();
  else if (!desktop.matches) dom.filtersOpen.focus();
}

/** Every clickable element declares data-action; one delegated listener handles them all. */
const actions = {
  'toggle-filter': ({ group, value }) => toggleFilter(group, value),
  'reset-filters': () => update({ filters: emptyFilters() }),
  'clear-search': () => { setQuery(''); dom.search.focus(); },
  'clear-all': clearAll,
  'toggle-saved': () => update({ savedOnly: !state.savedOnly }),
  popular: ({ value }) => { setQuery(value); scrollToResults(); },
  bookmark: ({ id }) => toggleBookmark(id),
  details: ({ id }) => openDetails(id),
  'close-modal': () => dom.dialog.close(),
  apply: () => { $('#apply-note').hidden = false; },
  page: ({ page }) => goToPage(Number(page)),
  retry: load,
  'open-filters': () => setDrawer(true),
  'close-filters': () => setDrawer(false),
  'show-results': () => { setDrawer(false); scrollToResults(); },
};

/* ---------- Events ---------- */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    actions[target.dataset.action]?.(target.dataset);
  });

  dom.search.addEventListener('input', () => {
    dom.searchClear.hidden = !dom.search.value;
    applySearch(dom.search.value);
  });
  dom.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applySearch(dom.search.value);
    applySearch.flush(); // Enter applies immediately instead of waiting for the debounce
    dom.search.blur();
    scrollToResults();
  });

  dom.sort.addEventListener('change', () => update({ sort: dom.sort.value }));
  dom.pageSize.addEventListener('change', () => update({ pageSize: Number(dom.pageSize.value) }));

  // Clicking the dark backdrop around the dialog closes it. Esc and focus trapping are native to <dialog>.
  dom.dialog.addEventListener('click', (event) => { if (event.target === dom.dialog) dom.dialog.close(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (document.activeElement === dom.search && dom.search.value) {
        event.preventDefault();
        setQuery('');
      } else {
        setDrawer(false);
      }
      return;
    }
    // "/" jumps to the search box, like on GitHub or YouTube.
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing && !dom.dialog.open && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
    }
  });

  desktop.addEventListener('change', (event) => { if (event.matches) setDrawer(false); });
}

/* ---------- Start ---------- */

function init() {
  ui.buildFilterGroups(dom.filterGroups);
  ui.buildSelect(dom.sort, Object.entries(SORT_OPTIONS).map(([value, option]) => [value, option.label]), state.sort);
  ui.buildSelect(dom.pageSize, PAGE_SIZES.map((size) => [String(size), `${size} per page`]), String(state.pageSize));
  ui.buildPopular($('#popular'), POPULAR_SEARCHES);
  ui.buildPopular($('#empty-popular'), POPULAR_SEARCHES);
  dom.search.value = state.query;
  bindEvents();
  render();
  load();
}

init();
