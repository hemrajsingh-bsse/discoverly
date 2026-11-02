# Discoverly — Searchable Listing Dashboard

A fast, accessible dashboard for browsing jobs, internships and freelance projects. Built with plain
**HTML5, CSS3 (Flexbox + Grid) and vanilla JavaScript (ES modules, Fetch API, Array methods)** — no
frameworks, no build step.

**Live preview:** `https://<your-username>.github.io/discoverly/` *(see [Deploy](#deploy))*

## Features

- **Dynamic cards** rendered from a local JSON dataset (`data/listings.json`, 16 listings) loaded with `fetch()`.
- **Live search** across title, skills and keywords (plus company, location and work mode), debounced, with matched text highlighted.
- **Multi-category filters**: Domain, Experience level, Work mode and Employment type. Each chip shows how many results it would give.
- **Search + filters combine with logical AND**, as required.
- **Sorting**: Newest, Oldest, Best match (relevance), Title A–Z, Title Z–A.
- **Pagination** with 6 / 9 / 12 per page.
- **UI states**: loading skeletons, empty state with one-click recovery, error state with retry.
- **Extras**: saved listings (localStorage), details modal, shareable URLs, `/` keyboard shortcut, mobile filter drawer, reduced-motion support.

## Run locally

ES modules and `fetch()` are blocked on `file://` URLs, so the folder must be served over `http://`.

| Option | Steps |
| --- | --- |
| VS Code | Install the **Live Server** extension → right-click `index.html` → **Open with Live Server** |
| Node | `npx serve .` then open the printed URL |
| Python | `python -m http.server 5500` then open `http://localhost:5500` |

If you open `index.html` by double-clicking it, the page shows a warning explaining this.

Run the unit tests (Node 20+): `npm test`

## Project structure

```
discoverly/
├── index.html            Page markup, icon sprite, empty/error views, details dialog
├── css/styles.css        Design tokens → base → layout → components → states → responsive
├── js/
│   ├── app.js            Entry point: state, events, render loop
│   ├── filters.js        Pure logic: search scoring, filters, facets, sorting, pagination
│   ├── ui.js             DOM rendering (cards, chips, tags, pagination, modal, toast)
│   ├── data.js           Fetches and normalizes the dataset; simulates latency and failures
│   ├── url-state.js      Syncs state with the query string
│   ├── bookmarks.js      Saved listings in localStorage
│   └── utils.js          debounce, relativeTime, formatDate, plural
├── data/listings.json    Mock dataset (16 listings)
└── tests/filters.test.js Unit tests (node:test)
```

**Folder structure matters.** `index.html` loads `css/styles.css` and `js/app.js`, and `data.js` loads
`data/listings.json`. If these files sit in one flat folder, the page renders without styles or data.

## How it works

Every interaction updates one `state` object and calls `render()`. Rendering is a pure pipeline:

```
listings ──► search (score) ──► saved-only ──► filters (AND) ──► sort ──► paginate ──► cards
```

`filters.js` has no DOM access, so the whole pipeline is unit-tested in Node.

### Search algorithm

1. **Normalize once.** When data loads, each listing gets three lowercase search strings:
   `title`, `tags` (skills + keywords) and `meta` (company, domain, level, work mode, type, location).
   Description text is not searched, which avoids noisy matches.
2. **Tokenize the query.** `"React  Remote"` → `["react", "remote"]`.
3. **Every term must match (AND).** Each term is checked with `String.includes()`, which gives
   substring matching, so `"type"` finds TypeScript.
4. **Score for relevance.** A term scores by the strongest field it appears in: title = 3, tags = 2,
   meta = 1. A listing that misses any term scores 0 and is excluded. The **Best match** sort orders by
   this score, then by date.
5. **Highlight.** Matched substrings in titles, company names and skills are wrapped in `<mark>`
   elements, built as DOM nodes (never `innerHTML`), so dataset text can't inject markup.

### Filter logic

- **Within a group: OR.** Selecting *Remote* and *Hybrid* shows listings that are either.
- **Across groups: AND.** *Design* + *Remote* shows only remote design roles.
- **Search + filters: AND.** A listing must match the search *and* every active filter group.
- **Facet counts.** The number on each chip is computed against the search and every *other* group's
  selection, so it tells you exactly how many results that chip would give.

### Debouncing

Typing fires an `input` event on every keystroke. The handler is wrapped in `debounce(fn, 200)`:
each keystroke resets a 200 ms timer, and the search only runs once typing pauses. Typing "react"
runs one search instead of five. The debounced function also exposes:

- `flush()`: pressing **Enter** applies the search immediately.
- `cancel()`: clearing the search drops any pending run so stale text can't reappear.

The clear (×) button updates instantly on each keystroke; only the expensive work is debounced.

### Performance

- Search strings are lowercased once at load, not on every keystroke.
- Filtering is a single linear pass; facets add one pass per filter group. This stays well under
  a millisecond for hundreds of listings.
- Filter chips are built once and only their `aria-pressed` and counts update, so clicking a chip
  never rebuilds the sidebar or loses keyboard focus.
- One delegated click listener handles every button, so re-rendering never rebinds events.
- Only the current page of cards is rendered.

### UI states

| State | When | What the user sees |
| --- | --- | --- |
| **Loading** | While `fetch()` runs (600 ms latency is simulated) | Shimmering skeleton cards, `aria-busy="true"` |
| **List** | One or more matches | Cards, result summary, pagination |
| **Empty** | Zero matches | Illustration, a message naming the query, and buttons to clear the search, reset filters or clear everything, plus suggested searches |
| **Error** | Network failure, timeout (8 s), HTTP error, invalid JSON | Error message with details and a **Try again** button |

To see the error state, add `?fail` to the URL (e.g. `index.html?fail`). The first load fails and
**Try again** recovers.

### State in the URL

Search, filters, sort, page size, page and saved-only are mirrored to the query string with
`history.replaceState`, for example `?q=react&mode=Remote&sort=az`. Refreshing or sharing the link
restores the same view. Invalid values in the URL are ignored.

### Accessibility

Semantic landmarks, a skip link, `aria-pressed` toggle chips inside `<fieldset>`/`<legend>`, a live
region announcing result counts, a native `<dialog>` (focus trap and Esc for free), visible focus
rings, 44 px touch targets and `prefers-reduced-motion` support.

## Data format

Each object in `data/listings.json`:

```json
{
  "id": "lst-001",
  "title": "Frontend Developer",
  "company": "Lumio Labs",
  "domain": "Development",
  "experienceLevel": "Mid Level",
  "workMode": "Remote",
  "employmentType": "Full-time",
  "location": "Remote · Europe",
  "description": "…",
  "skills": ["React", "TypeScript"],
  "keywords": ["frontend", "web"],
  "postedAt": "2026-10-27",
  "companyInitials": "LL",
  "companyColor": "#5B47F5"
}
```

Missing or malformed fields are filled with safe defaults by `normalizeListing()`.

## Deploy

**GitHub Pages**

1. Create a repository and push this folder (keep the folder structure).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
3. After a minute the site is live at `https://<username>.github.io/<repo>/`.

**Netlify / Vercel:** drag the folder onto the Netlify dashboard, or import the repo. No build command;
the publish directory is the project root.

## License

MIT
