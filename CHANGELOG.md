# Changelog

Notable implemented features, in the order the codebase evolved. Dates reflect the working session in which each change was made.

## 2026-11-18 — New Workshop, Phase 2: managers and professionals of sub-functions never exceed the parent's

- A parent's sub-functions take their managers, and in the same way their professionals, out of the parent's own Proposed Managers / Proposed Professionals. Together they cannot hold more of either than the parent has. A number that would break this is **not saved**: the box goes back to what it was, and a red message says why ("No managers left in COE: all 4 are already allocated to its sub-functions", or "Only 2 professionals left in COE: it has 10, and 8 are already allocated to its other sub-functions").
- When none are left, the box of the next sub-function is locked (greyed out) if it holds nothing. Its label says "none left in [parent]", and otherwise "max N".
- The parent's number cannot be lowered below what its sub-functions hold ("cannot have fewer professionals than its sub-functions hold (10)").
- Managers and professionals are checked separately. An empty box on the parent means "not entered yet": no limit. 0 is a real limit.
- Older data that is already over the limit is not locked: lowering is accepted, raising is refused.
- New Workshop only: AS-IS Baseline workshops are not affected.

## 2026-11-18 — Phase 2: the structure's scale in the sticky bar

- Phase 2 (normal and AS-IS Baseline workshops): the bar that stays at the top while scrolling now also shows the structure's own HC and Budget scale ("Allocating within [structure name]") when the reader is among the top-level functions, those that report straight to the structure. Before, it showed a scale only inside a parent's sub-function section, and disappeared on the top-level functions.
- The structure's summary card at the top of the page is read in place: while it is on screen, the bar stays hidden. Inside a parent's section the bar still shows that parent's scale. When the section ends, it goes back to the structure's.

## 2026-11-17 — Edit a completed workshop as a new version

- History, completed New Workshop: a new **Edit as new version** button. It starts a new draft that is an exact copy of that workshop: every Phase 1 answer (functions, parents, layer, structure type, opportunity answers, Q1/Q2) and every Phase 2 value (HC % and Cost %, Proposed HC and Cost, managers, professionals). The draft opens in Phase 1.
- Completing the draft adds a separate workshop to History. The original workshop does not change.
- The draft and its History card say which workshop it came from: "Version of Workshop #…".
- With the same structure targets, every figure is the same to the qəpik. If the targets have changed since, a message says so: the % are kept, and Proposed HC and Cost follow the current targets.
- Only one draft at a time: if a draft is open, the user is asked to resume or delete it first.
- AS-IS Baseline workshops do not get this button.
- Saving which workshop a version came from needs `supabase_workshop_history.sql` (the same file as the AS-IS copy).

## 2026-11-17 — Report and workshop fixes

- Excel sheet 7: "Change %" is measured from the AS-IS. A normal workshop shows "Proposed vs AS-IS" (57 → 48 = −15.8%), and an AS-IS Baseline workshop shows "Target vs AS-IS". Before, it was the difference to the target divided by the target (+18.75% or 0).
- Excel sheets 6 and 7, decision groups: every function is counted, each person once. A function counts what it holds beyond its sub-functions, and they count in their own group. Before, only top-level functions were counted, so a parent's whole team fell under the parent's decision.
- Executive Summary: in an AS-IS Baseline workshop the Within/Over Target status judges the proposal shown in the table, not the AS-IS column.
- A completed workshop keeps a copy of the AS-IS it was compared with. An AS-IS Baseline workshop keeps the copy taken when it was created. A later upload or edit of the structure's AS-IS no longer changes an old programme's AS-IS side, its dashboard or its Excel report. This needs `supabase_workshop_history.sql` to be run once in Supabase. Until then, it behaves as before.
- AS-IS Baseline workshop, red "Unallocated from AS-IS data" note: every function's amount is frozen at copy time (0 where there was none). Moving functions later no longer makes a note appear on a parent that had none.
- AS-IS Baseline workshop: after a structure target changes, the % next to each figure updates at once (the figures stay).
- Normal workshop, moving a function after allocation: its HC % is stored as exactly as needed. The moved function and the sub-functions already under its new parent keep their people (S stayed 4 instead of becoming 3).
- Money with qəpik always shows 2 decimals on screen (28 330.50, not 28 330.5). In Excel, such amounts show their decimals; whole amounts look as before.
- Tab no longer stops on the "?" help buttons, so no focus frame appears on them after typing a target. They still open with a click.

## 2026-11-17 — Critical fixes: AS-IS figures, Excel import, two people at the same time

- AS-IS figures: managers and professionals are one people pool, and the two costs are one cost pool. When a sub-function grows, the parent first uses its own unallocated amount of the same kind, then the other kind's. No parent goes down because something under it grew. A function that is moved or deleted takes its figures out of every parent in full. Before this, a parent could lose a person or 1 000 AZN in these cases (for example Customer Care 20 → 19).
- Excel import:
  - A parent row below the sum of its sub-functions is raised to that sum and reported. This covers a subtotal that was not updated and a row that holds only the head.
  - A file without a ROOT row: the root is now the parent name that the top functions (the ones with sub-functions) report into. A misspelt parent name is reported with the closest title ("did you mean …?") and the rows that use it.
  - Number cells are read as numbers: an Excel residue such as 1.1368E-13 becomes 0. Before, it became 1.14 AZN or 3 managers.
  - Text that can mean two amounts ("85000,50", "85.000") is set to 0 and reported, never stored as a guess. More than 2 decimals are rounded and reported.
  - When a function has the same title as the structure, the report's sheet 9 leaves Parent Function blank for top-level rows, so the sheet uploads back the same.
- Two people on the same structure:
  - A save sends only the fields it changed, and only if the cloud still has the old values. Another person's change to a different field is no longer undone by a page that was not refreshed.
  - AS-IS figures changed at the same time are added together, so +1 and +1 under one parent = +2. The user is told and asked to refresh.
  - A workshop completed on another computer cannot be turned back into a draft by an older page. Resume checks the cloud first.
  - Sign Out warns when changes have not reached the cloud yet (no connection), instead of losing them silently.

## 2026-11-16 — Structure figures: current calculated, targets set on the structure page

- Add New Structure asks only for Structure Name, Structure Type and C-Level Full Name. No figures are entered when a structure is created.
- Structure page (Division Data): Current Total Headcount and Current Total Budget are calculated from the AS-IS functions (top level only), the same way Managers and Professionals are, and update with every AS-IS change and Excel upload. Values typed in the past are no longer used, but they are not deleted.
- Headcount Target and Budget Target are typed straight into their cards and saved when the field is left. An empty field clears the target, and invalid values are refused. The Edit / Save / Cancel buttons are gone.
- Removed because nothing is typed any more: the "entered vs from the functions" notice and the Save All comparison dialog.
- The calculated totals are also used for the top-level AS-IS percentages, the dashboard AS-IS pies (no false "Remaining" slice at structure level) and Excel sheet 1.
- A new workshop (Start / New, or Analyze AS-IS Baseline) does not start until both targets are set: "Set Headcount Target and Budget Target first."

## 2026-11-16 — Excel import: warning for missing columns

- When the AS-IS file has no recognisable Parent Function, Managers, Professionals, Managers Cost (AZN) or Professionals Cost (AZN) column, the import now names the missing columns. Previously this happened silently: without Parent Function every function was placed at the top level, and a missing number column set those figures to 0. The import itself is unchanged.

## 2026-11-16 — Excel report: AS-IS Function Register sheet

- The Excel report gains a 9th sheet, "9. AS-IS Function Register". Sheets 1–8 are unchanged.
- The new sheet has the exact layout of the AS-IS upload template ("Function Register"): the same title, note, headers, colours and column widths, and a Parent Function list. It is filled with the structure's stored AS-IS functions. The ROOT row is the structure; each function is listed under its parent, and parents are shown in bold.
- The sheet can be uploaded again through Autofill. Its name contains "Function Register", so the import picks it from the report and recreates the same functions, parents and figures.

## 2026-11-16 — Unique function titles

Titles are unique within one structure's AS-IS list and within one workshop. Letter case and extra spaces are ignored ("Payroll", " payroll ", "PAYROLL" count as one title). Nothing already stored is renamed; the checks only refuse a title.

- AS-IS data: the title box on a card, a new row (Save and Save All), and Save in edit mode refuse a title that is already used in the structure. Save All keeps the refused rows open and saves the rest.
- Excel import: a file that uses a title more than once is refused as a whole, nothing changes, and the message lists the titles.
- "Analyze AS-IS Baseline" does not start while the AS-IS list uses a title more than once.
- Phase 1 Add / Edit Function (both workshop types): a message under Function Name names the existing function as soon as a used title is typed, and Save is refused. Keeping a function's own title is allowed.
- Complete Workshop (both workshop types) is refused while two functions share a title. Already completed workshops are left as they are.

## 2026-11-16 — New workshop: Proposed Cost from Cost Allocation %

Normal workshops only (created with Start / New). The AS-IS Baseline workshop and the AS-IS data are unchanged.

- Phase 2 card: Proposed Cost is no longer typed. It is shown like Proposed HC and always equals Cost Allocation % of the pool (the Budget Target at the top level, the parent's Proposed Cost below it); changing the % updates it at once, and sub-functions follow their parent. The Cost % box shows two decimals.
- Older workshops with typed Proposed Costs: when the workshop is opened, each typed cost becomes the exact Cost % it stands for (stored with as many decimals as needed). This is done only where every figure in the workshop stays exactly the same, to the qapik.
- Moving a function to another parent, or deleting a parent in Phase 1: the moved function, and the sub-functions of a deleted one, keep their Proposed Cost exactly. Their Cost % is re-expressed against the new pool, and parents are not changed (same rule as before).
- Review table: a normal workshop's Cost % is shown to two decimals.

## 2026-11-12 — Root structure and Excel import

- Excel import no longer reports the root as a missing parent. The root (the structure itself) is entered by hand, so a file may name it in Parent Function without a row of its own: the structure's name, a ROOT-marked row, or, in a file without a ROOT row, the unknown parent name most rows report into. Other unknown parent names (typos) are still reported.
- Structure page: when the typed Current Total Headcount or Current Total Budget differs from the totals of the structure's functions, an amber notice at the top shows both figures. The typed figures are kept as entered.

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
