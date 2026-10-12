<template>
  <header class="h-14 border-b border-border bg-surface-1 flex items-center justify-between px-6 flex-shrink-0 z-20">
    <div class="flex items-center gap-3">
      <h1 class="text-sm font-semibold text-ink">{{ pageTitle }}</h1>
      <span class="text-2xs text-ink-faint hidden sm:block">{{ dateLabel }}</span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Import CSV -->
      <CsvImport ref="csvImporter">
        <template #default="{ trigger }">
          <button class="btn btn-primary btn-sm" @click="trigger">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import CSV
          </button>
        </template>
      </CsvImport>
    </div>
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTimezoneStore } from '@/stores/timezone'
import { format } from 'date-fns'
import CsvImport from '@/components/ui/CsvImport.vue'

const route = useRoute()
const tzStore = useTimezoneStore()

const PAGE_TITLES = { dashboard: 'Dashboard', trades: 'Trade Logs', calendar: 'Calendar', journal: 'Journal', settings: 'Settings' }
const pageTitle  = computed(() => PAGE_TITLES[route.name] || 'EdgeLog')
const dateLabel  = computed(() => format(tzStore.localDateObj(), 'EEEE, MMMM d, yyyy'))
</script>
