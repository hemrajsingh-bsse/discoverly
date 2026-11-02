// Saved listings, persisted in localStorage. Falls back to memory when storage is blocked.

export function createBookmarkStore(storageKey) {
  const ids = read();

  function read() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  function write() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...ids]));
    } catch {
      /* storage unavailable (private mode, quota): keep bookmarks in memory only */
    }
  }

  return {
    ids,
    get size() { return ids.size; },
    has: (id) => ids.has(id),
    /** Toggles an id and returns whether it is now saved. */
    toggle(id) {
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      write();
      return ids.has(id);
    },
    /** Drops ids that no longer exist in the dataset. */
    retain(validIds) {
      const before = ids.size;
      for (const id of ids) if (!validIds.has(id)) ids.delete(id);
      if (ids.size !== before) write();
    },
  };
}
