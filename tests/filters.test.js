// Unit tests for the pure logic. Run with: npm test  (or: node --test)
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeListing } from '../js/data.js';
import {
  emptyFilters, facetCounts, matchesFilters, paginate, runPipeline, scoreListing, sortListings, tokenize,
} from '../js/filters.js';
import { debounce, relativeTime } from '../js/utils.js';

const raw = JSON.parse(readFileSync(new URL('../data/listings.json', import.meta.url), 'utf8'));
const listings = raw.map(normalizeListing);
const base = { query: '', filters: emptyFilters(), sort: 'newest', page: 1, pageSize: 100 };
const run = (overrides) => runPipeline(listings, { ...base, filters: emptyFilters(), ...overrides });
const titles = (result) => result.items.map((listing) => listing.title);

test('dataset has at least 12 distinct listings', () => {
  assert.ok(listings.length >= 12);
  assert.equal(new Set(listings.map((l) => l.id)).size, listings.length);
});

test('tokenize lowercases and splits on whitespace', () => {
  assert.deepEqual(tokenize('  React   TypeScript '), ['react', 'typescript']);
  assert.deepEqual(tokenize(''), []);
});

test('search matches title, skills and keywords, case-insensitively', () => {
  assert.ok(titles(run({ query: 'FRONTEND' })).includes('Frontend Developer')); // title + keyword
  assert.ok(titles(run({ query: 'pytorch' })).includes('Machine Learning Intern')); // skill
  assert.ok(titles(run({ query: 'dashboards' })).includes('Data Analyst')); // keyword
});

test('every search term must match (AND)', () => {
  const result = run({ query: 'react remote' });
  assert.ok(result.total > 0);
  for (const listing of result.items) {
    assert.ok(scoreListing(listing, ['react']) > 0 && listing.search.meta.includes('remote'));
  }
});

test('filters are AND across groups and OR within a group', () => {
  const filters = emptyFilters();
  filters.domain.add('Design').add('Product');
  filters.workMode.add('Remote');
  const result = run({ filters });
  assert.ok(result.total > 0);
  for (const listing of result.items) {
    assert.ok(['Design', 'Product'].includes(listing.domain));
    assert.equal(listing.workMode, 'Remote');
  }
});

test('search and filters combine with AND', () => {
  const filters = emptyFilters();
  filters.domain.add('Development');
  const result = run({ query: 'python', filters });
  assert.equal(result.total, 0); // Python roles exist, but none are in Development
  assert.ok(run({ query: 'python' }).total > 0);
});

test('zero matches returns an empty page', () => {
  const result = run({ query: 'zzzz-no-such-thing' });
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test('sorting by newest and by title', () => {
  const newest = sortListings(listings, 'newest');
  for (let i = 1; i < newest.length; i += 1) assert.ok(newest[i - 1].postedAt >= newest[i].postedAt);
  const az = sortListings(listings, 'az').map((l) => l.title);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b)));
});

test('relevance ranks title matches above skill matches', () => {
  const result = run({ query: 'designer', sort: 'relevance' });
  assert.match(result.items[0].title, /designer/i);
});

test('paginate clamps the page into range', () => {
  assert.deepEqual(paginate(16, 99, 6), { page: 3, totalPages: 3, start: 12, end: 16 });
  assert.deepEqual(paginate(0, 1, 6), { page: 1, totalPages: 1, start: 0, end: 0 });
});

test('facet counts ignore their own group but respect the others', () => {
  const filters = emptyFilters();
  filters.workMode.add('Remote');
  const counts = facetCounts(listings, filters);
  const remoteDesign = listings.filter((l) => l.workMode === 'Remote' && l.domain === 'Design').length;
  assert.equal(counts.domain.Design, remoteDesign);
  assert.equal(counts.workMode.Hybrid, listings.filter((l) => l.workMode === 'Hybrid').length);
});

test('matchesFilters with no selection lets everything through', () => {
  assert.ok(listings.every((l) => matchesFilters(l, emptyFilters())));
});

test('normalizeListing fills in missing fields', () => {
  const listing = normalizeListing({ title: '  ', company: 'Acme Corp', skills: ['A', 3, ''] }, 4);
  assert.equal(listing.id, 'listing-5');
  assert.equal(listing.title, 'Untitled opportunity');
  assert.equal(listing.initials, 'AC');
  assert.deepEqual(listing.skills, ['A']);
});

test('debounce only runs the last call', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const fn = debounce((value) => calls.push(value), 200);
  fn('r'); fn('re'); fn('rea');
  mock.timers.tick(199);
  assert.deepEqual(calls, []);
  mock.timers.tick(1);
  assert.deepEqual(calls, ['rea']);
  fn('react'); fn.flush();
  assert.deepEqual(calls, ['rea', 'react']);
  mock.timers.reset();
});

test('relativeTime', () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 9, 29, 12);
  assert.equal(relativeTime(now, now), 'Today');
  assert.equal(relativeTime(now - day, now), 'Yesterday');
  assert.equal(relativeTime(now - 3 * day, now), '3 days ago');
  assert.equal(relativeTime(now - 8 * day, now), '1 week ago');
  assert.equal(relativeTime(now - 40 * day, now), '1 month ago');
});
