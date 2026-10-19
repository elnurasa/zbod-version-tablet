# ZBOD Tool — Zero-Based Organizational Design

A workshop-driven web application for redesigning an organization "from zero." Facilitators capture an organization's **current (AS-IS)** structure, run a two-phase workshop to design its **proposed (TO-BE)** structure, and compare the two against headcount and budget targets.

## What it does

- Maintains a list of organizational **Structures** (divisions/departments/units), each with a current-state baseline (headcount, budget, AS-IS functions) and headcount/budget **targets**.
- Runs **ZBOD Workshops** per structure, in two phases:
  1. **Function Identification & Business Impact** — build the proposed org chart; each function is created on the chart with its elimination/automation/outsourcing screening and its Q1/Q2 business-impact scores (auto-deriving an INVEST / KEEP / OPTIMIZE / ELIMINATE decision).
  2. **Headcount & Cost Allocation** — allocate the structure's target headcount and budget down through the proposed function hierarchy by percentage.
- Produces an **AS-IS vs TO-BE dashboard** (decision mix, headcount/budget distribution pies, org chart, targets-vs-proposed) once a workshop is completed.
- Supports **HR review submission** and **Excel export** of workshop results.
- Includes an editable **landing page** (CMS-style content blocks: overview, guidelines, principles, etc.) for presenting the ZBOD methodology.

See [BUSINESS_RULES.md](BUSINESS_RULES.md) for how the workshop, scoring, and allocation logic actually works, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the codebase is put together.

## Tech stack

Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. Third-party libraries (Chart.js, ExcelJS, SheetJS/xlsx, FileSaver, html2canvas, Supabase JS) are loaded via CDN `<script>` tags in `index.html`. Data is stored in the browser's `localStorage` and optionally synced to a shared Supabase (Postgres) backend.

## Repository layout

```
index.html            All page markup (each "page" is a hidden <div>, shown/hidden via JS)
script.js              All application state, business logic, and rendering (~5,500 lines)
style.css               All styling — hand-authored utility classes + component classes
supabase.js              Supabase client + CRUD wrapper functions
supabase_setup.sql       Postgres schema + RLS policies for the Supabase backend
template.xlsx             Template asset used by the Excel export feature
logo.png                    Organization logo shown in the header
CHANGELOG.md         Notes from a past Supabase-integration migration (see docs/CHANGELOG.md for the feature changelog)
docs/                          This documentation
```

## Running it locally

There is no build step. Serve the folder with any static file server and open it in a browser, for example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`. Without a reachable Supabase project the app still works fully — it falls back to `localStorage`-only mode.

## Data persistence

- **Primary:** browser `localStorage` (works fully offline, single browser/device).
- **Optional sync:** if the Supabase client connects successfully, every write is also pushed to Postgres in the background, and on startup the app merges cloud data into `localStorage` (most-recently-updated wins). See [ARCHITECTURE.md](ARCHITECTURE.md#data-layer) for details.
