# EdgeLog — Trading Journal

Local-first trading journal built with Vue 3 + Vite + Tailwind + Pinia.
Sign-in is real (Supabase Auth, wired up — no public signup, accounts are
created in the Supabase dashboard). Trade data itself still stays in
`localStorage`; Supabase cloud sync for that is a separate, later step (see
"Enabling Supabase" below).

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build → /dist
```

Needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in a `.env` file at
the project root (gitignored — never commit it) for sign-in to work; get
both from your Supabase project's Settings → API page.

## Project structure

```
src/
├── lib/
│   ├── storage.js          ← THE adapter switch lives here (trade data)
│   ├── supabaseAdapter.js  ← ready-to-use, just not wired yet
│   ├── supabaseClient.js   ← the one shared Supabase client (auth + data)
│   ├── supabase.sql        ← run this when you connect Supabase
│   ├── csvParser.js        ← multi-broker CSV detection
│   └── stats.js            ← all analytics computations
├── stores/
│   ├── auth.js             ← real Supabase Auth (sign in/out, session)
│   ├── trades.js           ← calls adapter only (never localStorage directly)
│   └── settings.js         ← UI prefs
├── components/
│   ├── layout/             AppSidebar · AppTopbar
│   ├── ui/                 StatCard · BarList · CsvImport · ToastStack
│   ├── charts/             EquityCurve (Chart.js) · WinRateRing (SVG)
│   ├── calendar/           CalendarStrip
│   └── logs/               TradeDrawer (slide-over with notes + tags)
└── views/
    ├── DashboardView       7-day strip · equity curve · 6 chart panels
    ├── TradesView          searchable/sortable table · CSV import · drawer
    ├── CalendarView        full month grid with per-day P&L
    ├── AnalyticsView       deep stats · symbol breakdown
    └── SettingsView        storage info · export · Supabase instructions
```

## Enabling Supabase (when ready)

**3 steps, no store changes:**

1. `npm install @supabase/supabase-js`

2. Create `.env` in project root:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

3. In `src/lib/storage.js`, change the last line:
   ```js
   // Before:
   export const adapter = localAdapter

   // After:
   export { supabaseAdapter as adapter } from './supabaseAdapter'
   ```

That's it. The stores, views, and components are untouched.

Run the SQL in `src/lib/supabase.sql` in your Supabase SQL editor to create the table.

## CSV import

Supports TradeStation, Rithmic, NinjaTrader, and generic CSV.
Auto-detects column names — see `src/lib/csvParser.js` for the full mapping.
Duplicates are skipped on re-import (matched by symbol + date + pnl).
