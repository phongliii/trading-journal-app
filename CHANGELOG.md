# Changelog

## Unreleased

### Added
- **CI:** a GitHub Actions workflow runs the tests and a production build on
  every pull request and every push to main, so each PR shows ✓ / ✕ before
  it's merged.

### Changed
- Settings → Fund Transactions lists every deposit/withdrawal with a
  **Status** column: **Approved**, **Declined** for a withdrawal the broker
  refunded, or **Refund** for that refund. Declined withdrawals and refunds
  are struck through and still not counted anywhere.
- Journal: **+ Add section** only offers sections the note doesn't have yet
  (e.g. no "Review" when the note already has Review or Week Review), and
  disappears once every section is there. It also no longer shifts down
  when the section list opens.
- Journal: a newly added section scrolls into view with the cursor already
  in it, ready to type (it used to appear at the bottom, out of sight).
- The trade **note icon** and the **Has note** filter also count a chart
  image: a trade with only a chart image now shows the icon (hover says
  "Chart image"; with text too it adds "(+ chart image)").

### Fixed
- Deposits/withdrawals: a **withdrawal that wasn't approved** (the broker
  refunds it with a deposit of the same amount, Transaction ID + 1) showed as
  a withdrawal and a deposit — on the Balance chart, in Settings, and it
  counted as "withdrawn" for the withdraw reminder. Both are now left out;
  the balance is unchanged, since they cancel out.
- Balance chart: a deposit and a withdrawal on the same day were added
  together, so the hover showed only the net (and "Deposit +$0.00" when they
  cancelled out). Each is now listed on its own, and that day's dot is split
  — green half for the deposit, amber half for the withdrawal.
- Journal: **Remove** on a note section deleted it — and everything written
  in it — with one click. It now asks first when the section has content;
  an empty section is still removed straight away.
- Journal: the note icon in the day's trade list didn't appear for a note or
  chart image added while the page was open, until a page refresh.

## 2.2.0 — 2026-10-20

### Added
- **See which trades have a note.** Trades with a note show a note icon
  next to the symbol (Trades page and the Journal's trade list); hovering
  it shows the note's first line. The Trades page has a **Has note** filter
  that works together with Wins / Losses / Breakeven. An emptied note
  doesn't count.
- Journal: the day's trade table has **Time** (open → close) and **Duration**
  columns, like the Trades page. Weekly and monthly tables also show the date.
- **"Target reached!" pop-up** when the Account Balance crosses from below the
  withdraw target to at or above it (checked on load and right after an
  import). Shows once per crossing, per portfolio; it re-arms after the
  balance drops below the target. Needs the withdraw reminder turned on.
- Journal: **No-trade day** toggle in the daily check-in. Marked days show a
  "No-trade day" badge on the check-in card instead of the questions, and no
  longer re-prompt for them. The questions are hidden in the check-in while
  the toggle is on.
- Calendar and the Dashboard's weekly calendar show a no-trade day as
  "No trade" instead of "$0.00 / 0 trades".
- Calendar and the Dashboard's weekly calendar: every past day is now
  clickable. Clicking one replaces the cell's content with **Open note** (the
  day already has a Journal page) or **Create note** (it doesn't), plus
  **Close**. Week total cells work the same way for the weekly note, and a
  clicked day from the previous/next month isn't faded while its options show.
- Unit tests (`npm test`, Vitest) for stats, the Realized P&L buckets and the
  CSV parsers.

### Changed
- Messages use one icon per outcome: ✓ for anything done (fund transactions
  recorded, trades imported, data cleared — no more separate ℹ style), ⚠ for
  a heads-up, ✕ for a failure — each icon coloured to match (green, amber,
  red). Import files that can't be read now show as
  failures (✕) instead of warnings.
- **Loading cover** for long actions: importing, restoring Journal Data,
  Reset Everything, deleting all/many trades, clearing chart images,
  deleting a portfolio and switching portfolio now show a "please wait"
  cover with the current step, instead of a small toast. It blocks the page
  until every cloud save has finished, asks before the tab is closed
  mid-way, and always closes when done — even on an error. Quick actions
  (under ¼ s) never show it.
- **Charts redraw only when what they show changes.** All five charts now
  share one drawing helper: data handed back with the same values (a
  reload, a tab switch, an import) causes no redraw at all, several changes
  at once draw once, and a real change (e.g. a new range tab) updates the
  chart in place instead of rebuilding it.
- **Import CSV** is one drop zone for any mix of Position History, Cash
  History and Account Balance History (no more Trade / Account tabs), and
  each file can be imported on its own:
  - **Cash History alone** (e.g. after a withdrawal) records deposits and
    withdrawals and the cash history, and fills in fees on trades you already
    have. It never adds trades.
  - **Position History alone** takes fees from the Cash History you've
    already imported, and never replaces a trade's fees with $0.
  - Importing both together works as before.
  - Re-importing trades you already have no longer reports (and rewrites)
    every one of them as "updated" — only trades whose values changed are
    updated; the rest show as unchanged.
- Dashboard **Max Drawdown** card follows the Equity / Balance chart's range
  tab (1W / 1M / 3M / YTD / ALL) instead of always being all-time, and its
  title shows the tab (e.g. "Max Drawdown · 1M"). Without Cash History it
  falls back to trades instead of showing $0.
- Sidebar: the storage label now reads "Synced to cloud" instead of "Local
  storage" (data has lived in Supabase for a while).
- Settings → Withdraw reminder: clearer explanation, including that the
  withdrawal must be dated that week and the "Target reached" message.
- **Withdraw reminder** is now decided once a week, on the first trading day:
  if the balance going into that day is at or above the target, it reminds
  every trading day that week the balance is still at or above it, until a
  withdrawal is imported; if it's below,
  there's no reminder that week, even if the target is hit mid-week.
  Previously it reminded on any trading day the balance was over the target.
- **Removed the top bar's period picker** (30d / 60d / 90d / 1Y / All). It
  also silently limited the Trades page to that period; the Trades page now
  always lists every trade (use its own date filter to narrow down).
- Dashboard: the **Equity / Balance** chart has its own range tabs
  (1W / 1M / 3M / YTD / ALL), like the Realized P&L card. The stat cards
  (Trades, Win Rate, Total P&L, Profit Factor, Max Drawdown), Avg Win / Loss
  and Total Fees are now all-time.

### Fixed
- Importing while the Dashboard is open redrew its charts more than needed:
  deposits/withdrawals and cash history now update together (one redraw
  instead of two), and a Cash file with nothing new no longer changes the
  balance data at all (no redraw, no re-save).
- When the **Target reached** popup opened while the cursor was on a chart,
  the chart's hover tooltip stayed drawn on top of the popup and the chart
  kept its hover highlight. Opening the popup now clears both.
- Two real deposits or withdrawals on the same day for the same amount were
  treated as duplicates on import and only one was kept. They are now told
  apart by the broker's Transaction ID; ones saved earlier without an ID are
  matched once by date + amount (so re-importing never double counts) and get
  the ID filled in.
- Dashboard charts drawing more than once: the page showed as soon as trades
  loaded, then redrew the Equity / Balance chart (and popped in the Account
  Balance card) when balance and cash history arrived a moment later. It now
  waits for all three. Separately, every background refresh (switching
  pages, returning to the tab) replaced the trades and redrew every chart
  even when nothing had changed, because a display-only duration fill-in
  made the reload look different; refreshes now leave unchanged trades alone.
- Balance chart treated deposits/withdrawals like trading results: the line
  could turn red after a withdrawal, and the % on hover jumped (it was
  measured against deposited money, which a withdrawal shrinks). The colour
  now follows trading P&L only, deposits/withdrawals are marked with a dot
  and labelled on hover (e.g. "Withdrawal −$800.00"). The % on hover is
  trading P&L ÷ money put in (starting balance + deposits − withdrawals):
  $5,000 in and −$2,500 traded is −50%; withdraw $1,000 and it's −62.5%.
- Equity / Balance chart: the newest date on the axis could be skipped, and on
  3M / YTD / ALL each point was a whole week, so it was unclear which days it
  covered. The chart now has one point per day on every tab (weekends skipped
  unless something is dated on them), hovering shows that day, and the axis
  is labelled with the first day of each week.
- **Rich-text notes:** pressing Enter with bold (or another style) active,
  or in an empty note, sent the cursor back to the start of the first line
  (and in an empty note dropped the new line).
- **Account Balance changed by itself** from day to day: it only added the
  P&L of trades inside the top bar's period (30 days by default), so it moved
  as old trades aged out of that window, and when the period was switched. It
  now uses every trade.
- Journal: creating (or jumping to) a weekly note reset the quarter filter to
  "Show all" — it now switches to that week's quarter.
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

### Removed
- The unused Analytics page (it had no route or menu link).

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
