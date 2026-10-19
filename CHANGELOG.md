# Changelog

Notable implemented features, in the order the codebase evolved. Dates reflect the working session in which each change was made.

## 2026-10-19 — Tablet layout

- Portrait (768 px) and landscape (1024 px) tablets: page headers and card headers wrap instead of squeezing, dashboard pie charts sit one per row, and the decision summary sits above its chart below 1025 px. No page scrolls sideways.
- Touch screens: form fields use 16 px text (iPad Safari no longer zooms into them), icon buttons have a 40 px touch area, the impact chips are taller, and the mouse-only org-chart hint is hidden.
- Draft workshops have a visible delete (trash) button: a tablet has no right-click for the context menu.

## 2026-10-18 — Production readiness

**Run `supabase_production_hardening.sql` once in the Supabase SQL Editor** (after `supabase_security_hardening.sql`).

- Parent loops (A under B under A) can no longer freeze the page: rendering is guarded, loops are cut on load, and the Excel import refuses them.
- Excel import validates numbers (text, negatives, part-people, sub-qapik amounts) and reports every correction.
- Sign-out (and a different account signing in on the same browser) removes all locally cached data and the sync queue.
- Sync: deletions leave tombstones and are no longer merged back; rows deleted on another device (or access removed) disappear on the next load; only the signed-in account's own queued writes are ever sent; pending writes are delivered before loading.
- All read-only views (Review, dashboards, history, org-chart totals, Excel) compute figures fresh instead of reading cached copies.
- A completed workshop keeps the targets it was finished with (`workshops.target_*_snapshot`).
- Normal workshops, Phase 2: 0 is a real value, negatives are clamped, Cost % works after a typed cost.
- Only changed rows are saved (one edit no longer re-sends every function).
- Validation for structure create/edit and AS-IS entries; "Complete Workshop" lists open points first and refuses an empty workshop.
- Security: the hard-coded structure-password reset code is gone (owner/admin only); a user's login email cannot be edited from Manage Users; an admin cannot demote or delete itself; divisions and the CxO list require an active profile (SQL).
- Excel span-of-control uses the same per-layer rule as the screen; Escape closes dialogs; leaving a workshop no longer claims changes are lost.
- Normal workshops, Phase 1: a moved function, or a sub-function whose parent is deleted, keeps its own Proposed HC/Cost (its percentages are re-expressed against the new pool) instead of silently becoming a share of a different pool. 0% now means 0 people; only an empty percentage means "not allocated".
- AS-IS Baseline workshops: the "Unallocated from AS-IS data" amount of each parent is frozen at copy time (stored in the otherwise unused `workshop_functions.target_headcount` / `target_budget`), so moving functions in or out can no longer hide or invent the red note.

## 2026-07-27

### Added — Delete Draft Workshops
- Right-click context menu on cards in the "Draft Workshops — Click to Continue" list, offering **Delete Workshop**.
- Confirmation modal ("This action cannot be undone") before deleting.
- Deleting removes the workshop from the list immediately (no page reload) and shows a success/error toast depending on outcome.
- The delete option only ever appears for draft workshops — completed workshops are unaffected.

### Added — AS-IS vs TO-BE Dashboard: "Select Parent" filter
- The Distribution Analysis section's four pie charts (TO-BE Headcount, TO-BE Cost, AS-IS Headcount, AS-IS Cost) can now be scoped to any parent function's direct children via a dropdown.
- Defaults to the structure itself, showing its direct child functions immediately — no manual filtering required to see meaningful data.
- Selecting any other parent updates all four charts together, dynamically, with no page refresh.

### Added — "Remaining" pie slice
- When a selected parent's direct children don't fully account for its own allocated total, the pie charts add a neutral gray **Remaining** slice for the unaccounted portion, so a partially-allocated parent is never visually misrepresented as 100% complete.

### Fixed — Phase 3 allocation rounding
- Headcount/budget percentages were previously converted to whole units by rounding each child independently, which could make a sibling group's total drift above or below the parent's actual value.
- Replaced with the **Largest Remainder (Hamilton) Method**: exact shares are floored, then leftover units are distributed to the largest fractional remainders — sibling totals now always sum to exactly the parent's value when percentages sum to 100%.

### Fixed — Phase 3 proposed headcount/budget totals
- The workshop's overall proposed headcount/budget was previously computed by naively summing every function in the tree, double-counting parents against their own children.
- Corrected to a recursive per-parent total (children plus that parent's own unallocated "Remaining"), so nothing is double-counted or silently dropped.
- Removed a further class of bug where these totals were read from a **persisted cache** (`proposed_hc`/`proposed_budget` fields) that could go stale — e.g. an existing workshop opened without editing anything, or a division's target changed elsewhere without Phase 3 being re-touched. Totals are now always recomputed fresh from the current percentages and current targets, every time.

### Added — Parent-independent allocation validation
- Every parent structure in the Phase 3 tree (including the structure/division itself) is now validated **only** against its own direct children — a red "exceeds target" state and message for one parent (e.g. a nested team within a division) never marks an unrelated ancestor or sibling as invalid.
- Replaced an earlier design where the top-level summary used a recursive, whole-tree total, which could misattribute a nested branch's over-allocation to the division as a whole.

### Added — Project documentation
- `docs/README.md`, `docs/BUSINESS_RULES.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`.

## Baseline (prior to this session)

The application already implemented, before the changes above:

- Structures (divisions) with optional password protection, current-state baseline, and headcount/budget targets.
- AS-IS function baseline per structure, with its own parent/child hierarchy.
- Three-phase ZBOD workshop flow: Function Identification, Business Impact Evaluation, Headcount & Cost Allocation.
- AS-IS vs TO-BE dashboard: decision distribution, headcount/budget comparison bars, TO-BE org chart, targets vs proposed.
- Workshop history, HR review submission, and Excel export.
- Editable landing page content blocks (overview, guidelines, principles, function categorization matrix, etc.).
- `localStorage`-first persistence with optional background sync to a shared Supabase (Postgres) backend.
