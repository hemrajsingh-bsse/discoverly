// DOM rendering. Listing data is only ever inserted as text (textContent / text nodes), never as HTML.
import { FILTER_GROUPS } from './filters.js';
import { escapeRegExp, formatDate, plural, relativeTime } from './utils.js';

export const $ = (selector, root = document) => root.querySelector(selector);

/** Tiny element builder: h('p', { class: 'x', text: 'hi' }, child1, child2). */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false && child !== ''));
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/* ---------- Listing pieces ---------- */

const DOMAIN_TONES = {
  Development: 'blue', Design: 'pink', 'Data Science': 'teal', Marketing: 'amber', Product: 'violet', Business: 'slate',
};
const MODE_TONES = { Remote: 'green', Hybrid: 'violet', 'On-site': 'amber' };

const badge = (label, tone) => h('span', { class: `badge badge--${tone}`, text: label });
const listingBadges = (listing) => [
  badge(listing.domain, DOMAIN_TONES[listing.domain] ?? 'slate'),
  badge(listing.workMode, MODE_TONES[listing.workMode] ?? 'slate'),
  badge(listing.experienceLevel, 'outline'),
];

const logo = (listing, size = '') =>
  h('span', { class: `logo ${size}`.trim(), style: `--company:${listing.color}`, 'aria-hidden': 'true', text: listing.initials });

const metaItem = (iconName, label) => h('li', {}, icon(iconName), h('span', { text: label }));

/** Splits text into plain strings and <mark> elements around every search term. */
export function highlight(text, terms) {
  if (!terms.length) return [text];
  const sorted = [...terms].sort((a, b) => b.length - a.length); // prefer the longest match
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'gi');
  return text.split(pattern).filter(Boolean)
    .map((part) => (terms.includes(part.toLowerCase()) ? h('mark', { text: part }) : part));
}

function setBookmarkState(button, saved) {
  const { title } = button.dataset;
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', saved ? `Remove ${title} from saved` : `Save ${title}`);
  const label = button.querySelector('[data-label]');
  if (label) label.textContent = saved ? 'Saved' : 'Save';
}

/** Updates every bookmark button for a listing (card and modal) without re-rendering. */
export function syncBookmarkButtons(id, saved) {
  document.querySelectorAll('[data-action="bookmark"]').forEach((button) => {
    if (button.dataset.id === id) setBookmarkState(button, saved);
  });
}

function createCard(listing, { saved, terms, index }) {
  const visibleSkills = listing.skills.slice(0, 4);
  const hiddenCount = listing.skills.length - visibleSkills.length;
  const titleId = `title-${index}`;

  const bookmark = h('button', {
    class: 'bookmark', type: 'button', dataset: { action: 'bookmark', id: listing.id, title: listing.title },
  }, icon('bookmark'));
  setBookmarkState(bookmark, saved);

  return h('article', { class: 'card', style: `--i:${index};--company:${listing.color}`, 'aria-labelledby': titleId },
    h('header', { class: 'card__head' },
      logo(listing),
      h('div', { class: 'card__heading' },
        h('h3', { class: 'card__title', id: titleId },
          h('button', { class: 'card__link', type: 'button', dataset: { action: 'details', id: listing.id } },
            highlight(listing.title, terms))),
        h('p', { class: 'card__company' }, highlight(listing.company, terms))),
      bookmark),
    h('div', { class: 'badges' }, listingBadges(listing)),
    h('p', { class: 'card__desc', text: listing.description }),
    h('ul', { class: 'skills', 'aria-label': 'Skills' },
      visibleSkills.map((skill) => h('li', { class: 'skill' }, highlight(skill, terms))),
      hiddenCount > 0 && h('li', { class: 'skill skill--more', text: `+${hiddenCount}` })),
    h('ul', { class: 'card__meta' },
      metaItem('pin', listing.location),
      metaItem('briefcase', listing.employmentType),
      metaItem('clock', relativeTime(listing.postedAt))));
}

export function renderCards(grid, items, { terms, savedIds }) {
  grid.replaceChildren(...items.map((listing, index) =>
    createCard(listing, { saved: savedIds.has(listing.id), terms, index })));
}

export function renderSkeletons(grid, count) {
  const bar = (width, extra = '') => h('span', { class: `sk ${extra}`.trim(), style: `width:${width}` });
  grid.replaceChildren(...Array.from({ length: count }, () =>
    h('div', { class: 'card card--skeleton', 'aria-hidden': 'true' },
      h('div', { class: 'card__head' },
        h('span', { class: 'sk sk--logo' }),
        h('div', { class: 'card__heading' }, bar('75%', 'sk--title'), bar('45%'))),
      h('div', { class: 'sk-row' }, bar('', 'sk--pill'), bar('', 'sk--pill')),
      bar('100%'), bar('85%'), bar('60%'))));
}

/* ---------- Controls ---------- */

/** Builds the filter chips once. Later renders only call syncFilterGroups(), so focus is never lost. */
export function buildFilterGroups(container) {
  container.replaceChildren(...FILTER_GROUPS.map((group) =>
    h('fieldset', { class: 'filter-group' },
      h('legend', { class: 'filter-group__title', text: group.label }),
      h('div', { class: 'chips' }, group.options.map((value) =>
        h('button', {
          class: 'chip', type: 'button', 'aria-pressed': 'false',
          dataset: { action: 'toggle-filter', group: group.key, value },
        },
        h('span', { text: value }),
        h('span', { class: 'chip__count', 'aria-hidden': 'true', text: '0' })))))));
}

export function syncFilterGroups(container, filters, facets) {
  container.querySelectorAll('.chip').forEach((chip) => {
    const { group, value } = chip.dataset;
    const active = filters[group].has(value);
    const count = facets[group][value] ?? 0;
    chip.setAttribute('aria-pressed', String(active));
    chip.setAttribute('aria-label', `${value}, ${plural(count, 'result')}`);
    chip.classList.toggle('is-empty', count === 0 && !active);
    chip.querySelector('.chip__count').textContent = count;
  });
}

export function buildSelect(select, options, selected) {
  select.replaceChildren(...options.map(([value, label]) => h('option', { value, text: label })));
  select.value = selected;
}

export function buildPopular(container, terms) {
  container.replaceChildren(...terms.map((term) =>
    h('button', { class: 'popular-chip', type: 'button', dataset: { action: 'popular', value: term }, text: term })));
}

export function renderSavedToggle(button, count, active) {
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', `${active ? 'Show all listings' : 'Show saved listings'} (${count} saved)`);
  $('#saved-count').textContent = count;
}

/* ---------- Summary, tags, stats ---------- */

export function renderHeroStats(listings) {
  const companies = new Set(listings.map((listing) => listing.company)).size;
  const remote = listings.filter((listing) => listing.workMode === 'Remote').length;
  const stats = [['Open roles', listings.length], ['Companies hiring', companies], ['Remote roles', remote]];
  $('#hero-stats').replaceChildren(...stats.map(([label, value]) =>
    h('div', { class: 'stat' }, h('dt', { text: label }), h('dd', { text: String(value) }))));

  const newest = Math.max(...listings.map((listing) => listing.postedAt));
  if (listings.length) {
    $('#hero-eyebrow').textContent = `${plural(listings.length, 'opportunity', 'opportunities')} · updated ${relativeTime(newest).toLowerCase()}`;
  }
}

export function renderSummary(element, { total, pagination }) {
  element.textContent = total === 0
    ? 'No matching opportunities'
    : `Showing ${pagination.start + 1}–${pagination.end} of ${plural(total, 'opportunity', 'opportunities')}`;
}

const tag = (label, group, dataset) =>
  h('button', { class: 'tag', type: 'button', dataset, 'aria-label': `Remove ${group ? `${group}: ` : ''}${label}` },
    group && h('span', { class: 'tag__group', text: `${group}:` }),
    h('span', { text: label }),
    icon('x'));

export function renderActiveTags(container, { query, filters, savedOnly }) {
  const tags = [];
  const trimmed = query.trim();
  if (trimmed) tags.push(tag(`“${trimmed}”`, 'Search', { action: 'clear-search' }));
  if (savedOnly) tags.push(tag('Saved only', null, { action: 'toggle-saved' }));
  for (const group of FILTER_GROUPS) {
    for (const value of filters[group.key]) {
      tags.push(tag(value, group.label, { action: 'toggle-filter', group: group.key, value }));
    }
  }
  if (tags.length > 1) tags.push(h('button', { class: 'link-btn', type: 'button', dataset: { action: 'clear-all' }, text: 'Clear all' }));
  container.hidden = tags.length === 0;
  container.replaceChildren(...tags);
}

/* ---------- Pagination ---------- */

/** Page numbers with gaps, e.g. [1, '…', 4, 5, 6, '…', 10]. */
export function pageNumbers(current, total) {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  return pages.flatMap((page, i) => (i > 0 && page - pages[i - 1] > 1 ? ['…', page] : [page]));
}

export function renderPagination(nav, { page, totalPages }) {
  nav.hidden = totalPages <= 1;
  if (nav.hidden) return nav.replaceChildren();

  const pageButton = (target, content, extra = {}) =>
    h('button', { class: 'page-btn', type: 'button', dataset: { action: 'page', page: target }, ...extra }, content);

  nav.replaceChildren(
    pageButton(page - 1, [icon('chevron-left'), h('span', { class: 'page-btn__text', text: 'Prev' })],
      { disabled: page === 1, 'aria-label': 'Previous page' }),
    ...pageNumbers(page, totalPages).map((p) => (p === '…'
      ? h('span', { class: 'page-gap', 'aria-hidden': 'true', text: '…' })
      : pageButton(p, String(p), { 'aria-label': `Page ${p}`, 'aria-current': p === page ? 'page' : null }))),
    pageButton(page + 1, [h('span', { class: 'page-btn__text', text: 'Next' }), icon('chevron-right')],
      { disabled: page === totalPages, 'aria-label': 'Next page' }));
}

/* ---------- Views: loading | list | empty | error ---------- */

export function showView(name) {
  $('#view-list').hidden = name !== 'loading' && name !== 'list';
  $('#view-empty').hidden = name !== 'empty';
  $('#view-error').hidden = name !== 'error';
  $('#grid').setAttribute('aria-busy', String(name === 'loading'));
  if (name !== 'list') $('#pagination').hidden = true;
}

export function renderEmpty({ query, activeCount, savedOnly }) {
  const trimmed = query.trim();
  const onlySaved = savedOnly && !trimmed && activeCount === 0;
  const withFilters = activeCount ? ` with ${plural(activeCount, 'filter')} applied` : '';

  $('#empty-title').textContent = onlySaved ? 'No saved opportunities yet' : 'No opportunities found';
  $('#empty-message').textContent = onlySaved
    ? 'Tap the bookmark icon on any listing to keep it here.'
    : trimmed
      ? `Nothing matches “${trimmed}”${withFilters}. Check the spelling or try a broader term.`
      : 'No listings match the selected filters. Try removing one or two.';

  const actions = [];
  if (trimmed) actions.push(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'clear-search' }, text: 'Clear search' }));
  if (activeCount) actions.push(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'reset-filters' }, text: 'Reset filters' }));
  if (savedOnly) actions.push(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'toggle-saved' }, text: 'Show all listings' }));
  if (actions.length > 1) actions.push(h('button', { class: 'btn btn--primary', type: 'button', dataset: { action: 'clear-all' }, text: 'Clear everything' }));
  $('#empty-actions').replaceChildren(...actions);
  $('#empty-suggestions').hidden = !trimmed;
}

export function renderError(message) {
  $('#error-detail').textContent = message;
}

/* ---------- Details modal ---------- */

export function openDetails(dialog, listing, saved) {
  dialog.style.setProperty('--company', listing.color);
  $('#modal-logo', dialog).replaceChildren(logo(listing, 'logo--lg'));
  $('#modal-title', dialog).textContent = listing.title;
  $('#modal-company', dialog).textContent = listing.company;
  $('#modal-badges', dialog).replaceChildren(...listingBadges(listing));
  $('#modal-description', dialog).textContent = listing.description;
  $('#modal-skills', dialog).replaceChildren(...listing.skills.map((skill) => h('li', { class: 'skill', text: skill })));

  const facts = [
    ['pin', 'Location', listing.location],
    ['globe', 'Work mode', listing.workMode],
    ['briefcase', 'Employment', listing.employmentType],
    ['layers', 'Experience', listing.experienceLevel],
    ['calendar', 'Posted', `${formatDate(listing.postedAt)} · ${relativeTime(listing.postedAt)}`, 'fact--wide'],
  ];
  $('#modal-facts', dialog).replaceChildren(...facts.map(([iconName, label, value, extra]) =>
    h('div', { class: `fact ${extra ?? ''}`.trim() }, h('dt', {}, icon(iconName), label), h('dd', { text: value }))));

  const save = $('#modal-save', dialog);
  Object.assign(save.dataset, { id: listing.id, title: listing.title });
  setBookmarkState(save, saved);
  $('#apply-note', dialog).hidden = true;

  dialog.showModal();
  dialog.scrollTop = 0;
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  requestAnimationFrame(() => element.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2400);
}
