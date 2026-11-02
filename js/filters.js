// Pure search, filter, sort and pagination logic. No DOM access, so every function is unit-testable.

/** Each group maps a filter UI section to a listing field. `param` is its query-string key. */
export const FILTER_GROUPS = [
  {
    key: 'domain', param: 'domain', label: 'Domain', field: 'domain',
    options: ['Development', 'Design', 'Data Science', 'Marketing', 'Product', 'Business'],
  },
  {
    key: 'experience', param: 'level', label: 'Experience level', field: 'experienceLevel',
    options: ['Internship', 'Entry Level', 'Mid Level', 'Senior'],
  },
  {
    key: 'workMode', param: 'mode', label: 'Work mode', field: 'workMode',
    options: ['Remote', 'Hybrid', 'On-site'],
  },
  {
    key: 'employment', param: 'type', label: 'Employment type', field: 'employmentType',
    options: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'],
  },
];

const byNewest = (a, b) => b.postedAt - a.postedAt;

export const SORT_OPTIONS = {
  newest: { label: 'Newest first', compare: byNewest },
  oldest: { label: 'Oldest first', compare: (a, b) => a.postedAt - b.postedAt },
  relevance: { label: 'Best match' }, // compared with search scores, see sortListings()
  az: { label: 'Title A–Z', compare: (a, b) => a.title.localeCompare(b.title) },
  za: { label: 'Title Z–A', compare: (a, b) => b.title.localeCompare(a.title) },
};
export const DEFAULT_SORT = 'newest';

/** Searchable fields, strongest first. A term scores the weight of the first field it appears in. */
const FIELD_WEIGHTS = [['title', 3], ['tags', 2], ['meta', 1]];

export const tokenize = (query) => String(query ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);

export const emptyFilters = () => Object.fromEntries(FILTER_GROUPS.map((group) => [group.key, new Set()]));

export const countActiveFilters = (filters) => FILTER_GROUPS.reduce((sum, group) => sum + filters[group.key].size, 0);

/**
 * Scores a listing against search terms. Every term must appear in at least one field (AND),
 * otherwise the score is 0. With no terms every listing scores 1.
 */
export function scoreListing(listing, terms) {
  if (terms.length === 0) return 1;
  let score = 0;
  for (const term of terms) {
    const hit = FIELD_WEIGHTS.find(([field]) => listing.search[field].includes(term));
    if (!hit) return 0;
    score += hit[1];
  }
  return score;
}

const passesGroup = (listing, group, filters) =>
  filters[group.key].size === 0 || filters[group.key].has(listing[group.field]);

/** AND across groups, OR within a group. An empty group places no restriction. */
export function matchesFilters(listing, filters, groups = FILTER_GROUPS) {
  return groups.every((group) => passesGroup(listing, group, filters));
}

/**
 * For each option, how many listings would match if it were selected, given every *other* group's
 * selection. This is what the small number on each filter chip shows.
 */
export function facetCounts(listings, filters) {
  const counts = {};
  for (const group of FILTER_GROUPS) {
    const otherGroups = FILTER_GROUPS.filter((g) => g !== group);
    const pool = listings.filter((listing) => matchesFilters(listing, filters, otherGroups));
    counts[group.key] = Object.fromEntries(group.options.map((option) => [option, 0]));
    for (const listing of pool) {
      const value = listing[group.field];
      if (value in counts[group.key]) counts[group.key][value] += 1;
    }
  }
  return counts;
}

/** Returns a sorted copy. Ties fall back to title so the order is always predictable. */
export function sortListings(listings, sortKey, scores) {
  const compare = sortKey === 'relevance' && scores
    ? (a, b) => scores.get(b) - scores.get(a) || byNewest(a, b)
    : SORT_OPTIONS[sortKey]?.compare ?? byNewest;
  return [...listings].sort((a, b) => compare(a, b) || a.title.localeCompare(b.title));
}

export function paginate(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (current - 1) * pageSize;
  return { page: current, totalPages, start, end: Math.min(start + pageSize, total) };
}

/** search → saved-only → filters → sort → paginate. Returns everything the UI needs for one render. */
export function runPipeline(listings, { query, filters, sort, page, pageSize, savedOnly = false, savedIds = new Set() }) {
  const terms = tokenize(query);
  const scores = new Map();
  for (const listing of listings) {
    if (savedOnly && !savedIds.has(listing.id)) continue;
    const score = scoreListing(listing, terms);
    if (score > 0) scores.set(listing, score);
  }

  const searched = [...scores.keys()];
  const matches = searched.filter((listing) => matchesFilters(listing, filters));
  const sorted = sortListings(matches, sort, scores);
  const pagination = paginate(sorted.length, page, pageSize);

  return {
    terms,
    total: sorted.length,
    facets: facetCounts(searched, filters),
    pagination,
    items: sorted.slice(pagination.start, pagination.end),
  };
}
