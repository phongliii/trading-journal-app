-- EdgeLog cloud schema — Phase 2 (see the "Cloud Sync & Auth Roadmap" doc).
--
-- Run this in the Supabase SQL editor. It REPLACES the old dev-only `trades`
-- scaffold (single table, `allow_all` policy, no user_id) from Phase 1 with
-- the real schema: every table below carries `user_id` + `account_id` from
-- the start, and Row Level Security is the actual enforcement — not the
-- router guard in router/index.js, which only hides pages in the UI and
-- does nothing to stop a signed-in browser from reading another user's
-- rows at the API level. `account_id` scopes a user's own rows to one of
-- their portfolios (see the "Phase 3: multi-portfolio" block near the
-- bottom of this file) — it's a different portfolio within the SAME
-- user's data, not a second layer of access control, so RLS itself only
-- ever checks `user_id = auth.uid()`.
--
-- If you already ran the old version of this file: `drop table if exists
-- trades cascade;` first, then run this whole file. There's no data
-- migration path from the old table — it only ever held an `allow_all` dev
-- scaffold, nothing worth preserving.
--
-- ── Migration: bought_at/sold_at timestamptz → timestamp ──────────────────
-- Run this block FIRST if your `trades` table already exists with real
-- trade data in it (i.e. you already ran an earlier version of this file
-- and have imported CSVs since) — skip it on a fresh install, where the
-- `create table` below already uses the right column type from the start.
--
-- Those two columns were originally `timestamptz`, which silently treated
-- the naive broker-local timestamp strings csvParser.js produces as if
-- they were UTC, then handed them back with a 'Z' on every read — shifting
-- every trade time shown anywhere in the app (the Journal day chart, most
-- visibly) by the viewer's own UTC offset. See the column comment in the
-- `create table` below for the full explanation.
--
-- Supabase's SQL editor session is UTC by default, and the bad values were
-- inserted under that same default — casting straight back to `timestamp`
-- under a UTC session recovers the exact original digits with no data
-- rewrite needed. If you're running this somewhere your session timezone
-- might NOT be UTC, the explicit `set timezone` below forces it anyway.
-- `if exists` so this is also safe to run as part of a fresh install —
-- there's no `trades` table yet at this point on a first run, and this
-- becomes a no-op instead of an error.
set timezone = 'UTC';
alter table if exists trades alter column bought_at type timestamp;
alter table if exists trades alter column sold_at   type timestamp;

create extension if not exists "pgcrypto";

-- ── trades ──────────────────────────────────────────────────────────────
-- Mirrors the shape produced by lib/csvParser.js and edited in
-- components/logs/TradeDrawer.vue. broker_id is the broker's own round-trip
-- id (Position_History's "Pair ID") — storage.js's local adapter upserts on
-- it when present so a corrected re-import updates the existing row instead
-- of duplicating or silently failing to update it; see its own comment for
-- why. chart_image is a filename, not the image itself — chart images stay
-- in the user's locally-connected folder (imageStorage.js, the File System
-- Access API), there's no cloud image storage here.
create table if not exists trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid, -- unused until Phase 3; null = the user's one implicit account
  broker_id    text, -- broker's round-trip id, when the import source has one
  symbol       text not null,
  qty          integer not null default 1,
  side         text default 'long',
  buy_price    numeric(12,4),
  sell_price   numeric(12,4),
  gross_pnl    numeric(12,2),
  fees         numeric(12,2) default 0,
  pnl          numeric(12,2) not null, -- net P&L (after fees) — the figure the rest of the app reads as `pnl`
  -- `timestamp`, NOT `timestamptz` — deliberately. lib/csvParser.js's
  -- parseDate() builds these as a NAIVE string straight from the broker's
  -- own export ("09/09/2026 13:42:22" → "2026-09-09T13:42:22", no offset,
  -- no 'Z'), on purpose: it's a wall-clock reading from the broker, not an
  -- instant anyone wants converted — see that function's own comment.
  -- `timestamptz` would silently treat that naive string as UTC on insert,
  -- then hand it back with a 'Z' on select; every local-time formatter in
  -- the app (DayChart.vue's `format(parseISO(t.sold_at), 'HH:mm')`,
  -- Journal's day/week bucketing, etc.) would then shift that "13:42" by
  -- the viewer's own UTC offset — exactly the "chart times are wrong"
  -- symptom this was caught from. `timestamp` stores and returns the exact
  -- same digits that went in, no conversion either direction.
  bought_at    timestamp,
  sold_at      timestamp,
  duration     text,
  notes        text,       -- rich-text HTML from TradeDrawer's QuillEditor
  tags         text[] default '{}',
  strategy     text,
  chart_image  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists trades_user_sold_at_idx on trades (user_id, sold_at desc);
create index if not exists trades_user_symbol_idx  on trades (user_id, symbol);
-- Partial unique index, not a plain one: broker_id is null for trades with
-- no broker round-trip id (e.g. a single-file Performance.csv import), and
-- a plain unique index would only allow ONE such null row per user.
create unique index if not exists trades_user_broker_id_idx on trades (user_id, broker_id) where broker_id is not null;

alter table trades enable row level security;
create policy "trades_select_own" on trades for select using (user_id = auth.uid());
create policy "trades_insert_own" on trades for insert with check (user_id = auth.uid());
create policy "trades_update_own" on trades for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "trades_delete_own" on trades for delete using (user_id = auth.uid());

-- ── journal_entries ─────────────────────────────────────────────────────
-- One row per journal key, matching stores/journal.js's `data`/`readList`
-- (and lib/exportData.js's combined Notes export — same shape, so restoring
-- an exported Notes.json into this table is a near-direct row insert).
-- `key` is 'yyyy-MM-dd' (daily), 'yyyy-Wnn' (weekly), or 'yyyy-MM' (monthly).
-- `content` holds whatever's in that entry today — `sections` for daily/
-- weekly/monthly reviews, `checklist` answers, `image` filename — as one
-- JSONB blob rather than a column per field, since journal.js's own entry
-- shape has grown by adding keys to that object over time, not by adding
-- new top-level concepts; a JSONB column absorbs that the same way
-- localStorage already does, with no new migration each time it does.
-- `read` is folded in here (not a separate table) for the same reason
-- Notes/Read Status were folded into one export file: the two are only
-- ever useful together, and a row that's read but has no content yet
-- (viewing an auto-generated empty day) is just `content = '{}'`.
create table if not exists journal_entries (
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid,
  key          text not null,
  content      jsonb not null default '{}',
  read         boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, key)
);

alter table journal_entries enable row level security;
create policy "journal_entries_all_own" on journal_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── raw_csv_archive ─────────────────────────────────────────────────────
-- Backs stores/rawCsvArchive.js, which keeps each imported CSV kind
-- (position/cash/balance) as one array of raw rows, rewritten wholesale on
-- every import rather than diffed row-by-row — so one JSONB row per kind
-- matches how the app actually uses this data, rather than a normalized
-- table that would need a schema-per-broker-format to hold "whatever
-- columns that broker's CSV happened to have" (see csvParser.js's
-- multi-broker FIELD_MAPS).
create table if not exists raw_csv_archive (
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid,
  kind         text not null check (kind in ('position', 'cash', 'balance')),
  headers      text[] not null default '{}',
  rows         jsonb not null default '[]',
  updated_at   timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table raw_csv_archive enable row level security;
create policy "raw_csv_archive_all_own" on raw_csv_archive for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── balance ─────────────────────────────────────────────────────────────
-- One row per user. Backs stores/balance.js: the broker-reported starting
-- balance (rawStarting + earliestBalanceDate, both set together from an
-- Account_Balance_History import — see csvParser.js's parseBalanceHistory)
-- plus fundTransactions, the list of deposits/withdrawals parsed out of
-- Cash_History imports. Not folded into user_settings: fundTransactions
-- grows with every CSV import (same shape problem as trades/raw_csv_archive,
-- not a handful of hand-edited settings), and this feeds P&L math directly
-- (stores/balance.js's currentBalance), so it gets a dedicated table like
-- raw_csv_archive rather than sharing the settings blob's looser semantics.
create table if not exists balance (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  account_id            uuid,
  raw_starting          numeric(14,2),
  earliest_balance_date text,
  fund_transactions     jsonb not null default '[]',
  updated_at            timestamptz not null default now()
);

alter table balance enable row level security;
create policy "balance_all_own" on balance for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── cash_events ─────────────────────────────────────────────────────────
-- One row per user. Backs stores/cashEvents.js: the raw chronological
-- Cash_History events (fees, commissions, fund transactions) used for
-- drawdown/peak-equity calculation. Same "one JSONB blob, rewritten
-- wholesale" shape as raw_csv_archive — mergeEvents already treats this as
-- one array to dedupe-and-append, not rows to query individually.
create table if not exists cash_events (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  account_id   uuid,
  events       jsonb not null default '[]',
  updated_at   timestamptz not null default now()
);

alter table cash_events enable row level security;
create policy "cash_events_all_own" on cash_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── user_settings ───────────────────────────────────────────────────────
-- One row per user for everything else: small, single-value or short-list
-- settings that never grow past "a handful of fields a person sets once in
-- the Settings page" (stores/holidays.js, tradeMeta.js, tradingRules.js,
-- timezone.js, withdrawReminder.js, settings.js's compactMode). Deliberately
-- NOT one table per store — at this size that would be eleven near-empty
-- tables for data that's never queried, filtered or joined on, only ever
-- loaded whole and saved whole, exactly like lib/exportData.js's Settings
-- export already treats it (`data` here is that same shape).
create table if not exists user_settings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  account_id   uuid,
  data         jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "user_settings_all_own" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Phase 3: multi-portfolio ─────────────────────────────────────────────
-- Run this block once to turn on multiple portfolios ("accounts" in the
-- schema — separate broker/prop accounts you track side by side, switched
-- one at a time, not a combined view). Safe to run on a project that
-- already has real trades/journal/balance/cash-events data in it: it
-- creates one "Portfolio 1" account per existing user and backfills every
-- existing row's account_id to point at it, so nothing already in the app
-- moves or disappears — it just all becomes that one portfolio's data,
-- and any NEW portfolio you add afterward starts empty.
--
-- user_settings is DELIBERATELY left out of all of this — holidays, tags,
-- trading-rules cutoff, timezone, withdraw-reminder, compact-mode all stay
-- one shared set across every portfolio you create, not per-portfolio.
--
-- Re-running this whole block after it's already been applied is a no-op
-- (every step is written to tolerate that) — e.g. if you're not sure
-- whether you already ran it.

-- ── accounts ──────────────────────────────────────────────────────────
create table if not exists accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists accounts_user_id_idx on accounts (user_id);
alter table accounts enable row level security;
drop policy if exists "accounts_all_own" on accounts;
create policy "accounts_all_own" on accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- One default account per user who already has data in any of the
-- tables below but no account row yet — covers every existing user in
-- one pass, so nobody has to sign in first for their data to get a home.
insert into accounts (user_id, name, sort_order)
select distinct u.user_id, 'Portfolio 1', 0
from (
  select user_id from trades
  union select user_id from journal_entries
  union select user_id from raw_csv_archive
  union select user_id from balance
  union select user_id from cash_events
) u
where not exists (select 1 from accounts a where a.user_id = u.user_id);

-- Point every existing row with no account_id yet at that user's account.
-- `limit 1` only matters if a user somehow already had more than one
-- account before running this (shouldn't happen from a fresh install) —
-- picks the oldest one deterministically rather than leaving it to
-- whatever order the DB happens to return rows in.
update trades t set account_id = (
  select id from accounts a where a.user_id = t.user_id order by created_at limit 1
) where account_id is null;
update journal_entries j set account_id = (
  select id from accounts a where a.user_id = j.user_id order by created_at limit 1
) where account_id is null;
update raw_csv_archive r set account_id = (
  select id from accounts a where a.user_id = r.user_id order by created_at limit 1
) where account_id is null;
update balance b set account_id = (
  select id from accounts a where a.user_id = b.user_id order by created_at limit 1
) where account_id is null;
update cash_events c set account_id = (
  select id from accounts a where a.user_id = c.user_id order by created_at limit 1
) where account_id is null;

-- From here on every row must belong to a portfolio — the app always
-- supplies account_id now (there's no more "the user's one implicit
-- account" fallback), so this is enforced rather than left optional.
alter table trades alter column account_id set not null;
alter table journal_entries alter column account_id set not null;
alter table raw_csv_archive alter column account_id set not null;
alter table balance alter column account_id set not null;
alter table cash_events alter column account_id set not null;

-- Every row's account_id should actually point at a real account, and
-- deleting a portfolio (accounts store's removeAccount) should take that
-- portfolio's trades/journal/etc. with it rather than leaving them behind
-- as orphans with no account to belong to. Postgres has no `ADD
-- CONSTRAINT IF NOT EXISTS`, hence the catch-if-it's-already-there blocks.
do $$ begin
  alter table trades add constraint trades_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_entries add constraint journal_entries_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table raw_csv_archive add constraint raw_csv_archive_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table balance add constraint balance_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table cash_events add constraint cash_events_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- trades: the broker_id uniqueness guarantee was per-user; it needs to be
-- per-PORTFOLIO instead, now that one user can have the same broker_id
-- show up legitimately in two different portfolios (e.g. the same broker
-- account's CSV, imported into two separate EdgeLog portfolios by
-- mistake, should still be treated as two independent round trips, one
-- per portfolio — or more to the point, two DIFFERENT real accounts at
-- the same broker could coincidentally reuse fill numbering).
drop index if exists trades_user_broker_id_idx;
create unique index if not exists trades_account_broker_id_idx on trades (account_id, broker_id) where broker_id is not null;
create index if not exists trades_account_sold_at_idx on trades (account_id, sold_at desc);

-- journal_entries/raw_csv_archive/balance/cash_events: each row used to be
-- keyed by (user_id, ...) — now it's keyed by (user_id, account_id, ...),
-- since the same key (a date, a CSV kind) means something different in
-- each portfolio. balance/cash_events go from one row per USER to one row
-- per ACCOUNT.
alter table journal_entries drop constraint if exists journal_entries_pkey;
alter table journal_entries add primary key (user_id, account_id, key);

alter table raw_csv_archive drop constraint if exists raw_csv_archive_pkey;
alter table raw_csv_archive add primary key (user_id, account_id, kind);

alter table balance drop constraint if exists balance_pkey;
alter table balance add primary key (user_id, account_id);

alter table cash_events drop constraint if exists cash_events_pkey;
alter table cash_events add primary key (user_id, account_id);

-- ── Phase 4: data-integrity CHECK constraints ───────────────────────────
-- RLS above stops a user reading/writing someone ELSE's rows, but says
-- nothing about whether a row's own values make sense — the app's own
-- forms already reject these cases (csvParser.js, TradeDrawer.vue), but
-- a bad CSV import, a direct API call with the anon key, or a bug in a
-- future client could still write a negative qty or a nonsense `side`
-- straight past every UI guard. These constraints are the backstop, not
-- a replacement for the app-side checks — enforced here because the
-- database is the one place every write path (current and future) has to
-- go through regardless of which client wrote it.
--
-- Safe to run even on a table with existing data, PROVIDED that data
-- already satisfies these constraints (it should, since the app never
-- wrote anything else) — if any existing row fails one of these, the
-- `alter table` for it errors out and leaves the table untouched; fix or
-- delete the offending row(s) and re-run just that statement. Postgres
-- has no `ADD CONSTRAINT IF NOT EXISTS`, hence the catch-if-it's-already-
-- there blocks, same pattern as the foreign keys in Phase 3 above.
do $$ begin
  alter table trades add constraint trades_qty_positive check (qty > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table trades add constraint trades_side_valid check (side is null or side in ('long', 'short'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table trades add constraint trades_buy_price_nonneg check (buy_price is null or buy_price >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table trades add constraint trades_sell_price_nonneg check (sell_price is null or sell_price >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table trades add constraint trades_fees_nonneg check (fees >= 0);
exception when duplicate_object then null; end $$;
