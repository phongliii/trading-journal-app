<template>
  <aside class="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface-1 h-full">

    <!-- Logo -->
    <div class="flex items-center gap-2.5 px-5 h-14 border-b border-border flex-shrink-0">
      <div class="w-7 h-7 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      </div>
      <span class="font-semibold text-sm text-ink tracking-tight">EdgeLog</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      <p class="text-2xs text-ink-faint font-medium px-2 mb-2 mt-1">Overview</p>
      <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" custom v-slot="{ isActive, navigate }">
        <button @click="navigate" class="nav-link" :class="{ active: isActive }">
          <component :is="item.icon" class="w-4 h-4 flex-shrink-0" />
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="ml-auto text-2xs font-semibold bg-brand/10 text-brand px-1.5 py-0.5 rounded-full">
            {{ item.badge }}
          </span>
          <span v-if="item.to === '/journal' && journalStore.hasUnread" class="ml-auto w-2 h-2 rounded-full bg-yellow-400/80"></span>
        </button>
      </RouterLink>
    </nav>

    <!-- Footer -->
    <div class="flex-shrink-0 border-t border-border px-3 py-3 space-y-0.5">
      <!-- Portfolio switcher -->
      <div class="mb-2">
        <PortfolioSwitcher />
      </div>
      <!-- Divider — no margin of its own: the footer's space-y-0.5 already
           gives it (and Export & Restore right after it) the same small
           top gap every other footer row gets, and Export's own py-2 top
           padding (its normal clickable hit area, invisible until hover)
           supplies the rest below the line. A margin-bottom here too would
           stack on top of that padding and make this gap read as roughly
           double the one above the line. -->
      <div class="border-t border-border"></div>
      <RouterLink to="/export" custom v-slot="{ isActive, navigate }">
        <button @click="navigate" class="nav-link" :class="{ active: isActive }">
          <IconExport class="w-4 h-4" />
          <span>Export & Restore</span>
        </button>
      </RouterLink>
      <RouterLink to="/settings" custom v-slot="{ isActive, navigate }">
        <button @click="navigate" class="nav-link" :class="{ active: isActive }">
          <IconSettings class="w-4 h-4" />
          <span>Settings</span>
        </button>
      </RouterLink>
      <div class="px-2 py-1 text-2xs text-ink-faint flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
        Local storage
      </div>
    </div>

  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useJournalStore } from '@/stores/journal'
import PortfolioSwitcher from './PortfolioSwitcher.vue'

const tradesStore  = useTradesStore()
const journalStore = useJournalStore()

import { h } from 'vue'
const icon = (d) => ({ render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'stroke-width': '1.8', innerHTML: d }) })
const IconGrid     = icon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="7" y1="13" x2="7" y2="9"/><line x1="12" y1="13" x2="12" y2="7"/><line x1="17" y1="13" x2="17" y2="10"/>')
const IconList     = icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>')
const IconCalendar = icon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>')
const IconSettings = icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
const IconJournal  = icon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="11" x2="13" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/><path d="M14 15.5l4-4 1.5 1.5-4 4-2 .5.5-2z"/>')
const IconExport   = icon('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')

const navItems = computed(() => [
  { to: '/',          label: 'Dashboard',  icon: IconGrid },
  { to: '/trades',    label: 'Trade Logs', icon: IconList },
  { to: '/calendar',  label: 'Calendar',   icon: IconCalendar },
  { to: '/journal',   label: 'Journal',    icon: IconJournal },
])
</script>
