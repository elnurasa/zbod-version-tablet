# Architecture

## Overview

This is a **single-page, framework-free JavaScript application**. There is no build step, no bundler, no component framework — `index.html` loads `style.css`, `supabase.js`, and `script.js` (plus third-party CDN libraries) directly via `<script>`/`<link>` tags. Cache-busting is done manually via `?v=N` query strings on the local files.

## Pages

`index.html` contains every "page" as a `<div id="page-*" class="page hidden">`. Only one is visible at a time; `showPage(name)` toggles the `hidden` class. Pages: `landing`, `divisions`, `workspace`, `phase1`, `phase2`, `phase3`, `review`, `transition`, `history`, `history-review`, `hr-review`.

Each page has a corresponding `render*()` function in `script.js` (e.g. `renderPhase3()`) that builds the page's HTML as a template-literal string and assigns it to the page's content container via `.innerHTML`. There is no virtual DOM and no diffing — every state change that should be visible calls the relevant `render*()` function again, which rebuilds that section's markup from scratch.

## State & control flow

- A single module-level `state` object (`script.js`, top of file) holds all UI state: current page, selections, in-progress form edits, etc. It is a plain object, not reactive — nothing re-renders automatically when it changes.
- A single global `app` object (the `APP CONTROLLER` section) exposes every user-facing action as a method (e.g. `app.updatePhase3Value(...)`, `app.deleteWorkshop(...)`). Markup wires these up via inline `onclick`/`onchange` attributes rather than addEventListener-based event delegation.
- The typical mutation pattern is: **read current data → compute updates → persist (`upd*`/`add*`/`del*` data-layer function) → call the relevant `render*()` function** — all synchronous, in the same call stack, so the UI reflects the new state immediately without needing a reactive layer.

## Data layer

### Local storage
`LS` (near the top of `script.js`) maps logical entities to `localStorage` keys (`zbod_divisions`, `zbod_workshops`, `zbod_functions`, `zbod_as_is`, plus CMS/metrics keys). `lsGet`/`lsSet` wrap `localStorage` with JSON (de)serialization. Each entity has `get*`/`add*`/`upd*`/`del*` functions (e.g. `getWs`, `addWs`, `updWs`, `delWs`) that are the only code allowed to touch these keys directly.

### Supabase sync
`supabase.js` wraps a Supabase (Postgres) client behind `window.zbodSupabase`, exposing `sbLoad*`/`sbSave*`/`sbDelete*` per entity, all going through a single `sbRun(fn)` helper that swallows errors and returns `null` on failure (never throws). Every `add*`/`upd*`/`del*` in `script.js` writes to `localStorage` first (synchronous, so the UI never waits on the network), then fires the matching Supabase call asynchronously ("fire-and-forget"). On startup, `loadFromSupabase()` fetches all tables and merges them into `localStorage`, with the more-recently-updated (`updated_at`) record winning per row. If no Supabase client is available (offline, or the library failed to load), the app runs entirely on `localStorage`.

### Schema (`supabase_setup.sql`)
Five tables: `divisions`, `workshops`, `workshop_functions`, `as_is_functions`, `landing_box_settings` — with `ON DELETE CASCADE` from divisions → workshops/as_is_functions and workshops → workshop_functions. Row-Level Security is enabled with permissive `anon` policies (no authentication — this is a shared, unauthenticated public workspace by design; the Supabase anon key is embedded directly in `supabase.js`, which is expected for a public anon key but does mean there's no per-user access control).

## Core domain model

- **Division** (a "Structure") — top-level record with current-state and target headcount/budget.
- **Workshop** — belongs to a division; carries `status` (`draft`/`completed`) and `phase`.
- **Workshop function** (TO-BE) — belongs to a workshop; self-referential `parent_id` forms the proposed org tree; carries Phase 1/2/3 fields (screening answers, scores, allocation percentages, computed `proposed_hc`/`proposed_budget`).
- **AS-IS function** — belongs to a division (not a workshop); self-referential `parent_id` forms a parallel current-state tree.
- **Landing box settings** — generic `box_id → content` rows powering the editable landing page CMS blocks.

## Allocation engine

The headcount/budget cascading logic lives in a small cluster of pure functions in `script.js`, all working against the `parent_id` tree of workshop functions:

- `largestRemainderAllocate(total, weights)` — generic Largest Remainder (Hamilton) Method: given a total and a set of percentage weights, returns integer allocations that never drift from independent rounding.
- `buildCascadedAllocations(fns, divHC, divBudget, phase3Values)` — walks the function tree top-down, calling `largestRemainderAllocate` once per sibling group, producing `{ proposedHC, proposedBudget, parentHC, parentBudget }` per function. This is the **single source of truth** for "what does this workshop's current percentages actually add up to" — it is always recomputed fresh from percentages, never from a cached/persisted value.
- `renderP3MiniTracker` / the root allocation tracker in `renderPhase3()` — both validate **only** a given parent's direct children against that parent's own value; there is no global/recursive validation anywhere in the UI.
- `recomputeAndSaveAllCascaded` — persists the cascade's output (`proposed_hc`/`proposed_budget`) back onto each function record after every edit. Those persisted fields are a **display cache only** (used by the dashboard pies, org chart, and Excel export) — they are never read back in as an input to further validation or totals.
- `calculateWorkshopAllocationTotals` / `calculateProposedHeadcount` / `calculateProposedBudget` — used outside Phase 3 (Review page, dashboard, export) to get a workshop's overall proposed totals; these also always rebuild the cascade fresh from current percentages rather than trusting cached fields, so they can't go stale if a division's target changes after the workshop was last saved.

## Charting

Chart.js renders the AS-IS vs TO-BE dashboard's pie charts (`renderDashboardCharts`). A shared `pieLabelPlugin` draws percentage labels directly on each slice. The "Distribution Analysis" pies share one `execPalette` color array; a "Remaining" slice (when present) is always colored a fixed neutral gray (`#9ca3af`), distinct from the category palette. Charts are destroyed and recreated (not updated in place) whenever their underlying filter or data changes, via a small `_chartRegistry` + `registerChart`/`destroyChart` bookkeeping layer that prevents Chart.js's "canvas already in use" errors on re-render.

## Export

`app.exportToExcel()` uses ExcelJS (loaded via CDN) to build a multi-sheet workbook client-side (function detail, decision summary, targets vs proposed) and triggers a download via FileSaver — no server involved.

## Known limitations (as implemented)

- No automated test suite.
- No authentication — Supabase RLS policies allow the anonymous key full read/write; access control is limited to optional per-division passwords stored and checked client-side.
- The password reset flow depends on a single hardcoded reset code checked in client-side JavaScript.
- Workshop `status` has a third value, `'active'`, referenced once in the codebase but never actually set anywhere — effectively dead/vestigial.
