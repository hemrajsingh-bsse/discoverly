// Small framework-free helpers shared across the app.

/**
 * Returns a debounced version of `fn` that only runs after `ms` milliseconds without a new call.
 * `flush()` runs a pending call immediately; `cancel()` drops it.
 */
export function debounce(fn, ms) {
  let timer = null;
  let pendingArgs = null;

  const debounced = (...args) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(debounced.flush, ms);
  };
  debounced.flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!pendingArgs) return;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

const DAY_MS = 86_400_000;

/** "Today", "Yesterday", "3 days ago", "2 weeks ago"… */
export function relativeTime(timestamp, now = Date.now()) {
  const days = Math.floor((now - timestamp) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${plural(Math.floor(days / 7), 'week')} ago`;
  if (days < 365) return `${plural(Math.floor(days / 30), 'month')} ago`;
  return `${plural(Math.floor(days / 365), 'year')} ago`;
}

export const formatDate = (timestamp) =>
  new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
