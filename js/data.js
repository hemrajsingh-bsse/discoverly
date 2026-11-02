// Data layer: fetches the mock dataset and normalizes every record into a predictable shape.
// Add ?fail to the page URL to simulate a network error on the first load (Try again then recovers).

// Resolved relative to this file, so it works no matter which URL the page is served from.
const DATA_URL = new URL('../data/listings.json', import.meta.url);
const SIMULATED_LATENCY_MS = 600;
const REQUEST_TIMEOUT_MS = 8000;

let attempts = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const textList = (value) => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const lower = (...parts) => parts.join(' ').toLowerCase();

const initialsOf = (name) =>
  name.split(/\s+/).filter((word) => /^[a-z0-9]/i.test(word)).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';

/** Date-only strings ("2026-10-28") are read as local midnight so they never shift a day. */
function parseDate(value) {
  const raw = text(value);
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/** Fills in missing fields and precomputes lowercase search strings once, so filtering stays cheap. */
export function normalizeListing(raw, index) {
  const record = raw && typeof raw === 'object' ? raw : {};
  const company = text(record.company, 'Unknown company');

  const listing = {
    id: text(record.id, `listing-${index + 1}`),
    title: text(record.title, 'Untitled opportunity'),
    company,
    domain: text(record.domain, 'Business'),
    experienceLevel: text(record.experienceLevel, 'Entry Level'),
    workMode: text(record.workMode, 'On-site'),
    employmentType: text(record.employmentType, 'Full-time'),
    location: text(record.location, 'Location not specified'),
    description: text(record.description, 'No description provided.'),
    skills: textList(record.skills),
    keywords: textList(record.keywords),
    postedAt: parseDate(record.postedAt),
    initials: text(record.companyInitials, initialsOf(company)).slice(0, 3),
    color: /^#[0-9a-f]{6}$/i.test(record.companyColor) ? record.companyColor : '#5B47F5',
  };

  listing.search = {
    title: lower(listing.title),
    tags: lower(...listing.skills, ...listing.keywords),
    meta: lower(listing.company, listing.domain, listing.experienceLevel, listing.workMode,
      listing.employmentType, listing.location),
  };
  return listing;
}

export async function loadListings() {
  attempts += 1;
  await wait(SIMULATED_LATENCY_MS);

  if (attempts === 1 && new URLSearchParams(location.search).has('fail')) {
    throw new Error('Simulated network error (?fail is in the URL). Press “Try again” to recover.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(DATA_URL, { signal: controller.signal, cache: 'no-cache' });
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'The request timed out.'
      : 'The listings file could not be reached. Serve the folder over http:// (for example with Live Server).');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}. Check that data/listings.json exists.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('data/listings.json is not valid JSON.');
  }
  if (!Array.isArray(data)) throw new Error('data/listings.json must contain an array of listings.');

  return data.map(normalizeListing);
}
