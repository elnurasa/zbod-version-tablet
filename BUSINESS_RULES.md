# Business Rules

This describes the core domain logic as currently implemented in `script.js`. It does not cover UI styling or unrelated CMS content editing.

## 1. Structures (Divisions)

A **Structure** represents an organizational unit being redesigned. Fields: `structure_name` (picked from a preset list or "Other"), `structure_type` (`Division` / `Department` / `Unit` / `Other`), `c_level_name`, `current_total_hc`, `headcount_target`, `current_total_budget`, `budget_target`, plus creator identification (name, position, email) and an optional password.

- **Optional password protection:** if a structure has a password set (`division_password_temp`), opening it or deleting it requires entering that password first. Password reset is gated by a separate fixed reset code (client-side check).
- **Deleting a structure** cascades: its workshops, workshop functions, AS-IS functions, and AAA insight cards are all removed.

## 2. AS-IS baseline

Each structure has a set of **AS-IS functions** — the organization's current-state functions — each with `manager_count`, `current_employee_count`, `current_function_hc`, `managers_cost`, `professionals_cost`, and an optional `parent_id` (AS-IS functions can themselves form a parent/child tree, e.g. "Finance" → "Treasury").

## 3. Workshops

A structure can have multiple workshops over time. A workshop has a `status` of `draft` or `completed`, and a `phase` marking progress. The app shows two phases (1 = Function Identification & Business Impact, 2 = Headcount & Cost Allocation); the stored value stays 1 for the first and 3 for the allocation phase, and a legacy stored 2 (the former separate Business Impact step) is treated as phase 1. Only one workshop per structure is expected to be in `draft` at a time (the UI offers to resume the existing draft or start a new one). Draft workshops can be deleted directly from a right-click context menu on the "Draft Workshops" list.

### Phase 1 — Function Identification & Business Impact

Both parts below are captured together in the Add/Edit Function form on the org chart: the screening answers and Notes first, then the Q1 / Q2 scores.

#### Function identification

For each proposed (TO-BE) function, the user records: name, career level, structure type, an optional `parent_id` (building the TO-BE function tree), and three yes/no screening questions — *can this be eliminated / automated / outsourced?*

These three answers combine into a review flag:

| Elimination | Automation | Outsourcing | Result |
|---|---|---|---|
| No | No | No | **PASSED FILTER** |
| Yes | No | No | REVIEW FOR ELIMINATION |
| No | Yes | No | REVIEW FOR AUTOMATION |
| No | No | Yes | REVIEW FOR OUTSOURCING |
| any other combination | | | REVIEW FOR \<all "Yes" answers\> |

#### Business impact evaluation (Q1 / Q2, part of Phase 1)

Each function is scored on two questions (1–5 each). The combined score maps to a decision:

| Q1 + Q2 total | Decision |
|---|---|
| ≥ 9 | **INVEST** |
| ≥ 7 | **KEEP** |
| ≥ 5 | **OPTIMIZE** |
| < 5 | **ELIMINATE** |

A function's decision can also be set manually (`zbod_decision`), which overrides the computed value.

### Phase 2 — Headcount & Cost Allocation

This is the most involved rule set. The structure's `headcount_target` and `budget_target` are distributed down through the TO-BE function tree by user-entered percentages.

**Per-parent allocation.** Every function that has children distributes its own headcount/budget to those children by percentage — independently of every other parent in the tree. A function's own allocated HC/Budget becomes the pool its own children allocate from.

**No independent rounding.** Percentages are converted to whole headcount/budget units using the **Largest Remainder (Hamilton) Method**: each child's exact share is floored, then any leftover units are handed out one at a time to the children with the largest fractional remainder. This guarantees a sibling group's allocated values always sum to exactly the parent's own value whenever their percentages sum to exactly 100% — never off by a rounding unit.

**Remaining.** If a parent's children's percentages sum to less than 100%, the unallocated portion is the parent's "Remaining" — real headcount/budget that still exists at that parent level, just not broken into named children.

**Validation is strictly parent-by-parent, never global.** For every parent, independently:

```
Sum(that parent's direct children's allocated HC)  vs.  that parent's own HC
Sum(that parent's direct children's allocated Budget)  vs.  that parent's own Budget
```

If a parent's children (plus Remaining) exceed that parent's own value, **only that parent's section** is flagged invalid (red bar, red values, a warning message). A problem inside one branch of the tree never marks an unrelated ancestor or sibling branch as invalid — each parent, including the structure itself (the root of the tree), is validated only against its own direct children, recursively, at every depth.

## 4. AS-IS vs TO-BE Dashboard

Shown once a workshop is completed (and from workshop history). Contains:

- **Decision Summary** — functions grouped by INVEST / KEEP / OPTIMIZE / ELIMINATE, plus a pie chart.
- **Distribution Analysis** — four pies (TO-BE Headcount, TO-BE Cost, AS-IS Headcount, AS-IS Cost), filterable by a **"Select Parent"** dropdown.
  - Defaults to the structure itself: each pie shows the structure's direct child functions.
  - Selecting a different parent scopes all four pies to that parent's direct children.
  - Whenever the selected parent's children don't fully account for its own total, a gray **"Remaining"** slice is added so the pie never silently represents less than the parent's real total.
- **Headcount/Budget Comparison bars** — AS-IS vs TO-BE vs Target.
- **TO-BE Org Chart** — the proposed function tree.
- **Targets vs Proposed** — overall structure-level totals vs targets.

## 5. HR Review & Export

A completed workshop can be **submitted for HR review**, which timestamps `submitted_for_hr_review_at` and shows a read-only HR submission summary. A structure's workshop(s) can also be exported to an Excel workbook (function-level detail, decision summary, targets vs proposed).

## 6. Key Findings / AAA insight cards

Each structure can hold free-text "AAA" insight cards (workspace-level notes) and a Key Findings list, independent of the workshop lifecycle.
