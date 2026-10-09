# Changelog

## Unreleased

### Added
- Journal: **No-trade day** toggle in the daily check-in. Marked days show a
  "No-trade day" badge on the check-in card instead of the questions, and no
  longer re-prompt for them. The questions are hidden in the check-in while
  the toggle is on.
- Calendar and the Dashboard's weekly calendar show a no-trade day as a
  "No trade" instead of "$0.00 / 0 trades".

### Fixed
- Journal: a chart image added to a day with no trades didn't show (it was
  only rendered alongside the trade stats).
- Journal: reopening a trade from the day's trade table showed its old chart
  image, notes, tags and strategy until a page refresh.
- Trades: the Breakeven tile showed "undefined" when a filter matched no trades.
- Max Drawdown (Dashboard, Journal week/month): a period that opened with a
  loss didn't count that first drop — the peak now starts at the equity going
  into the period.
- Compact money format with 0 decimals no longer drops integer zeros
  ($150K showed as $15K).

### Added
- Unit tests (`npm test`, Vitest) for stats, the Realized P&L buckets and the
  CSV parsers.

## 2.1.0 — 2026-10-06

### Added
- **Pick a date for a new journal note.** "+ New" in the Journal sidebar opens
  the date picker on the Daily, Weekly and Monthly tabs, preselected to
  today / this week / this month. Future periods are locked. The button is
  "+ Create note", or "Open note →" when that period already has one.
  Weekly mode highlights the Mon–Fri week; monthly mode shows a 12-month grid.
  This is the same `DatePickerCalendar` as the Trades picker, in a note mode.
- **Dashboard: "Realized P&L" card with range tabs** (1W / 1M / 3M / YTD / ALL),
  replacing "Daily P&L". Independent of the dashboard-wide period and
  remembered between visits. Bars are days for 1W/1M, weeks for
  3M/YTD, and months for ALL once there's more than a year of history. Shows
  the range total above the chart.

### Changed
- Dashboard: on the Realized P&L and Performance cards the info (i) button sits
  next to the title, with the tabs / period dropdown at the far right.
- "Mark week complete" / "Mark month complete" removed — "+ New" replaces them.
- Date picker: today has a thin ring (same as the Journal picker); the current month/year are highlighted;
  days between a range's ends are rounded; the year-range label returns to the
  first step (and so does the Calendar page's decade view).
- Date picker fixed height is opt-in (`fixed-height` prop) and off everywhere.
- Settings → About no longer claims "local-first / your data never leaves your
  browser"; it just shows the version.
- Settings → Storage: now reads "Cloud" / saved to your Supabase account; removed the
  Export JSON / CSV buttons (the Export & Restore page covers it) and the
  browser-only "Storage used" tile; Clear Data is now **Reset**: deletes the
  active account's trades, journal, balance, cash events, backed-up CSVs and
  cloud preferences, then clears this browser's local data except your login.
- Settings → Supabase Table Schema: the note no longer says the app doesn't use
  these tables yet.

### Fixed
- Date picker: edge days no longer flash the bright color when paging months.

## 2.0.2 — 2026-10-06

### Fixed
- **Date picker no longer jumps around.** Switching between the day, month
  and year views, or paging between months with 4, 5 or 6 weeks, used to
  resize the popup and move the divider and Clear/Apply buttons. The picker
  now always reserves the height of the tallest view (a 6-week day grid), so
  they stay put. Affects every page that uses the date picker (Trades,
  Dashboard, Export).

## 2.0.1 — 2026-10-06

### Changed
- **Weekly and monthly journal entries are now opt-in.** They no longer
  appear automatically when a week/month ends; a period shows up only once
  you create it with "Mark week/month complete". Daily entries are
  unchanged (still listed for every day you traded). Existing weekly/monthly
  notes you've already written are untouched.
- "Mark week complete" is now available on weekends too (it used to be
  hidden, because weeks auto-appeared by then).

## 2.0.0 — 2026-10-04

### Fixed
- **Redundant cloud fetches** — `trades`, `balance`, and `cashEvents` stores
  now coalesce concurrent `load()` calls into one shared in-flight promise
  (matching `journal`/`accounts`), closing the "dashboard fetches data too
  many times" race.
- **Dashboard chart flicker** — background refreshes (navigation, tab
  focus) no longer replace store data with a new-but-equal reference when
  nothing actually changed, so `DailyBarChart` and the equity curve stop
  redrawing for no reason. `loaded` flags are still set unconditionally so
  Dashboard's skeleton gate isn't affected.
- **Per-page lazy fetching** — rewrote `lib/cloudSync.js` into a per-store
  refresh registry (`PAGE_STORES`) so navigating to a page only refreshes
  the stores that page actually reads, instead of refreshing everything on
  every navigation or tab focus. Restored the original 15s (navigation/tab
  focus) and 5s (Journal entry click) throttle clocks, now sharing state
  through the same registry so they don't double-count each other's
  refreshes.
- **Calendar → Journal jump** — fixed a race where jumping to an entry from
  Calendar or a Weekly/Monthly view also triggered the period-filter
  watcher's own auto-select, landing on the wrong entry. Faded
  adjacent-month calendar cells with a real entry are clickable again.
  Jumping to an entry now scrolls it into view.

### Added — input validation
- **Sign-in**: email format is checked before calling Supabase.
- **Chart image upload**: rejects non-image files and files over 10MB,
  rather than relying solely on the HTML `accept` hint.
- **Trading rules cutoff time**: validated as `HH:mm` (24h); an invalid
  value (e.g. from a hand-edited localStorage key or a bad cross-device
  sync) falls back to the default instead of silently corrupting cutoff
  comparisons.
- **Tags / Strategies / Checklist questions / Portfolio names**: shared
  add/edit modals now enforce a length cap and reject case-insensitive
  duplicates, with the error shown inline.
- **Portfolio store**: `createAccount`/`renameAccount` reject empty/
  whitespace-only names at the store layer, not just in the calling modal.
- **Database**: added `CHECK` constraints (`qty > 0`, `side in ('long',
  'short')`, non-negative prices/fees) to `src/lib/supabase.sql` as a
  backstop against any write path that bypasses the app's own forms. Run
  this block in the Supabase SQL editor against your project — it isn't
  applied automatically.

---

## 1.6.0 and earlier
No changelog kept before 2.0.0.
