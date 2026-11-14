# Sentinel Board — category-weighted token launch radar

A dashboard that ranks pre-token DeFi protocols by an implied token value and
shows a reader how to farm each one.

## What it does

- Reads the sealed snapshot (`snapshot.json`, 758 protocols, 40-slug watchlist,
  $50M floor) and scores every pre-token protocol with one formula:
  `implied = round(TVL × 0.22 × categoryMultiplier × (1 + clamp(change_7d, -60, 120) / 100 × 0.6) × (0.6 + 0.4 × min(age_days, 1095) / 1095))`
- Category weights: Dexs 1.15, Lending 1.10, Yield 1.05, Derivatives 1.05,
  everything else 1.00. Age is days since first listing; unknown age counts
  as 365 days. No protocol name is special-cased.
- Board: all 40 watchlist slugs plus the 110 largest pre-token protocols
  below the floor, by TVL — 150 rows, ranked 1..150 by implied value.
- Every row carries five concrete farm steps, each with a cost and a time,
  derived from the protocol's category, chains, TVL and age.
- Dashboard: light theme, top-3 protocol cards, a sortable table (rank,
  protocol, category, chains, TVL, 7-day change, implied value), a detail
  view per protocol with the model breakdown and farm plan, and text plus
  category filtering. Views via URL: `?view=board` (default),
  `?view=detail&slug=<slug>`, `?view=filtered&f=<text>`. No network.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json` (written last, via the vendored `makefun-board.ts`
library). The run is deterministic: two runs write byte-identical
`board.json` and `dossier.json`.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — the model: snapshot parsing, implied value, farm steps, board builder, self-check.
- `vendor/makefun-board.ts` — make.fun's dossier library (copied from the kit).
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`).
- `screenshots/` — board, detail and filtered views of the dashboard.
