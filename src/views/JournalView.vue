<template>
  <div class="flex h-full overflow-hidden">

    <!-- Left sidebar -->
    <div class="w-64 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col">

      <!-- Tabs + year/month selector -->
      <div class="px-3 pt-3 pb-2 border-b border-border">
        <div class="flex items-center gap-1 mb-2">
          <button v-for="tab in tabs" :key="tab.id"
            @click="activeTab = tab.id"
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-2xs font-medium transition-colors relative"
            :class="activeTab === tab.id ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink'">
            {{ tab.label }}
            <span v-if="tab.unread > 0" class="w-1.5 h-1.5 rounded-full bg-orange-400/80"></span>
          </button>
          <TooltipWrap :tip="activeTab === 'daily' ? 'Select month' : activeTab === 'weekly' ? 'Select quarter' : 'Select year'">
            <button @click="openPeriodPicker" class="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
          </TooltipWrap>
        </div>
        <div class="flex items-center justify-between gap-2 px-1 mb-1">
          <span class="text-2xs text-ink-faint truncate">{{ periodLabel }} · {{ currentEntries.length }} entr{{ currentEntries.length === 1 ? 'y' : 'ies' }}</span>
          <div class="flex gap-2 flex-shrink-0">
            <DatePickerCalendar :mode="activeTab" :existing="existingNoteKeys" @create="createNote" @open="openNote" />
          </div>
        </div>
      </div>

      <!-- Entry list -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="!pagedEntries.length" class="px-4 py-8 text-xs text-ink-muted text-center">
          No entries for {{ periodLabel }}
        </div>
        <div v-for="entry in pagedEntries" :key="entry.key"
          :ref="el => setEntryRef(entry.key, el)"
          class="flex items-center border-b border-border/50 transition-colors hover:bg-surface-2"
          :class="selected?.key === entry.key ? 'bg-surface-2 border-l-2 border-l-brand' : ''">
          <button @click="selectEntry(entry)" class="flex-1 text-left px-4 py-3 min-w-0">
            <div class="flex items-center gap-1.5">
              <span v-if="!entry.isRead" class="w-1.5 h-1.5 rounded-full bg-orange-400/80 flex-shrink-0"></span>
              <span class="text-xs font-semibold text-ink truncate">{{ entry.label || formatDate(entry.date) }}</span>
            </div>
            <div class="text-2xs text-ink-muted mt-0.5">{{ entry.trades.length }} trade{{ entry.trades.length !== 1 ? 's' : '' }}</div>
          </button>
          <TooltipWrap tip="Delete">
            <button @click="confirmDelete(entry)" class="px-3 py-3 text-ink-faint hover:text-down transition-colors flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </TooltipWrap>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-2 border-t border-border">
        <button @click="page--" :disabled="page === 0" class="btn btn-ghost btn-sm text-2xs" :class="page === 0 ? 'opacity-30' : ''">◀</button>
        <span class="text-2xs text-ink-faint">{{ page + 1 }} / {{ totalPages }}</span>
        <button @click="page++" :disabled="page >= totalPages - 1" class="btn btn-ghost btn-sm text-2xs" :class="page >= totalPages - 1 ? 'opacity-30' : ''">▶</button>
      </div>

    </div>

    <!-- Right panel -->
    <div ref="detailPanel" class="flex-1 overflow-y-auto overflow-x-auto bg-surface-1">
      <div v-if="!selected" class="flex items-center justify-center h-full text-ink-muted text-sm">
        Select an entry
      </div>

      <div v-else class="px-8 py-8 min-w-[1000px]">

        <!-- Header -->
        <div class="mb-6">
          <div class="flex items-center justify-between gap-3 mb-1">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h1 class="text-2xl font-bold text-ink">{{ selected.label || formatDate(selected.date) }}</h1>
            </div>
            <TooltipWrap v-if="selected.type === 'daily' && !entryImage && !hasImageFolder" tip="Connect a chart image folder in Settings first.">
              <button disabled
                class="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-2xs text-ink-faint cursor-not-allowed opacity-60">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                Add chart
              </button>
            </TooltipWrap>
            <button v-else-if="selected.type === 'daily' && !entryImage" @click="chartFileInput.click()"
              class="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-2xs text-ink-muted hover:text-ink hover:border-border-strong transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              Add chart
            </button>
            <input ref="chartFileInput" type="file" accept="image/*" class="hidden" @change="onChartFileSelected" />
          </div>
          <div v-if="dayStats.total > 0" class="text-sm font-mono font-semibold mt-1"
            :class="dayStats.pnl >= 0 ? 'text-up' : 'text-down'">
            Net P&L {{ fmt(dayStats.pnl) }}
          </div>
        </div>

        <CheckinCard v-if="selected.type === 'daily'"
          :questions="journalStore.checklistQuestions"
          :answers="checkinAnswers"
          @edit="showCheckinModal = true" />

        <!-- Stats + chart + table (only when trades exist) -->
        <template v-if="selected.trades.length > 0">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
            <div v-for="s in statItems" :key="s.label" class="bg-surface-2 border border-border rounded-lg px-3 py-2 overflow-visible min-w-0">
              <div class="flex items-center justify-between mb-1 gap-1">
                <div class="text-2xs text-ink-muted whitespace-nowrap truncate">{{ s.label }}</div>
                <TooltipWrap :tip="s.tip">
                  <svg class="w-3.5 h-3.5 text-ink-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
                    <path d="M11 12h1v5h1" stroke-linecap="round"/>
                  </svg>
                </TooltipWrap>
              </div>
              <div class="text-sm font-semibold font-mono whitespace-nowrap truncate" :class="s.class">
                <CompactValue v-if="s.raw !== undefined" :value="s.raw" />
                <template v-else>{{ s.value }}</template>
              </div>
            </div>
          </div>

          <!-- Attached chart image -->
          <div v-if="entryImage" class="bg-surface-2 border border-border rounded-xl overflow-hidden mb-4 relative group cursor-pointer" @click="lightboxOpen = true">
            <img v-if="entryImageUrl" :src="entryImageUrl" alt="Chart" class="w-full h-64 object-cover" />
            <div v-else class="w-full h-64 flex flex-col items-center justify-center gap-2 bg-down/5">
              <svg class="w-6 h-6 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" stroke-linecap="round"/>
                <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none"/>
              </svg>
              <span class="text-2xs text-down">File not found</span>
              <button @click.stop="clearBrokenImage" class="text-2xs text-down bg-down/10 rounded-full px-3 py-1 hover:bg-down/20 transition-colors">Clear</button>
            </div>
            <div v-if="entryImageUrl" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button @click.stop="removeChartImage" class="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-ink hover:bg-surface-3 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Remove
              </button>
            </div>
          </div>

          <div class="bg-surface-2 border border-border rounded-xl p-4 mb-4">
            <div class="text-xs font-medium text-ink mb-3">Session P&L</div>
            <!-- selected.type is 'daily' | 'weekly' | 'monthly' — this used
                 to collapse monthly into the 'daily' branch (anything not
                 'weekly'), so a month's worth of trades got labeled by
                 clock time alone, jumping all over the x-axis with no
                 sense of which day each point was from. -->
            <div class="h-32"><DayChart :trades="selected.trades" :mode="selected.type" /></div>
          </div>

          <div class="mb-8 bg-surface-2 border border-border rounded-xl overflow-hidden">
            <div class="overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>P&L</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in pagedTrades" :key="t.id" @click="selectedTrade = t" class="cursor-pointer">
                    <td class="font-mono font-semibold text-ink">{{ t.symbol }}</td>
                    <td>
                      <span class="badge-neutral" v-if="!t.side || t.side === 'long'">Long</span>
                      <span class="badge-down" v-else>Short</span>
                    </td>
                    <td class="font-mono">{{ t.qty }}</td>
                    <td class="font-mono text-xs text-ink-muted">{{ t.buy_price != null ? t.buy_price.toFixed(2) : '—' }}</td>
                    <td class="font-mono text-xs text-ink-muted">{{ t.sell_price != null ? t.sell_price.toFixed(2) : '—' }}</td>
                    <td class="font-mono font-semibold" :class="t.pnl >= 0 ? 'text-up' : 'text-down'">{{ fmt(t.pnl) }}</td>
                    <td>
                      <span v-if="(t.gross_pnl ?? t.pnl) > 0" class="badge-up">Win</span>
                      <span v-else-if="(t.gross_pnl ?? t.pnl) < 0" class="badge-down">Loss</span>
                      <span v-else class="badge-neutral">Breakeven</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="totalTradePagesForEntry > 1" class="flex items-center justify-between px-4 py-2 border-t border-border">
              <span class="text-2xs text-ink-muted">{{ selected.trades.length }} trades · page {{ tradePage + 1 }} of {{ totalTradePagesForEntry }}</span>
              <div class="flex gap-1">
                <button @click="tradePage--" :disabled="tradePage === 0" class="btn btn-ghost btn-sm text-2xs" :class="tradePage === 0 ? 'opacity-30' : ''">◀</button>
                <button @click="tradePage++" :disabled="tradePage >= totalTradePagesForEntry - 1" class="btn btn-ghost btn-sm text-2xs" :class="tradePage >= totalTradePagesForEntry - 1 ? 'opacity-30' : ''">▶</button>
              </div>
            </div>
          </div>
        </template>

        <!-- Sections -->
        <draggable
          v-model="selected.sections"
          item-key="id"
          handle=".drag-handle"
          ghost-class="section-ghost"
          drag-class="section-dragging"
          animation="200"
          class="space-y-8"
          @end="persistEntry">
          <template #item="{ element: section }">
            <div>
              <hr class="border-border/50 mb-4" />
              <div class="flex items-center gap-2 mb-3">
                <span class="drag-handle text-ink-faint/50 hover:text-ink-faint cursor-grab active:cursor-grabbing select-none" title="Drag to reorder">⠿</span>
                <span class="text-base">{{ section.emoji }}</span>
                <h3 class="text-base font-bold text-ink">{{ section.title }}</h3>
                <button @click="removeSection(section.id)" class="ml-auto text-2xs text-ink-faint hover:text-down transition-colors">Remove</button>
              </div>
              <QuillEditor v-model="section.content" :placeholder="section.placeholder" @update:modelValue="persistEntry" />
            </div>
          </template>
        </draggable>

          <div class="flex items-center gap-2 pt-2 flex-wrap">
            <button @click="showAddSection = !showAddSection" class="text-xs text-ink-muted hover:text-ink transition-colors">+ Add section</button>
            <template v-if="showAddSection">
              <button v-for="s in sectionPresets" :key="s.title" @click="addSection(s)"
                class="text-xs border border-border rounded-full px-3 py-1 hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors">
                {{ s.emoji }} {{ s.title }}
              </button>
            </template>
          </div>

      </div>
    </div>

    <!-- Year selector modal -->
    <Teleport to="body">
      <div v-if="showYearModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showYearModal = false">
        <div class="bg-surface-3 border border-border-strong rounded-xl w-64 p-4 shadow-2xl">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-medium text-ink">Select year</p>
            <button type="button" class="text-ink-faint hover:text-ink transition-colors" aria-label="Close" @click="showYearModal = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="year in pagedYearModalYears" :key="year"
              @click="selectedYear = year; showYearModal = false; page = 0"
              type="button"
              class="py-2 text-2xs rounded-md border transition-colors"
              :class="selectedYear === year ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-surface-4 border-border text-ink hover:border-border-strong'">
              {{ year }}
            </button>
          </div>
          <div v-if="totalYearModalPages > 1" class="flex items-center justify-between pt-2 mt-2 border-t border-border">
            <button type="button" @click="yearModalPage--" :disabled="yearModalPage === 0"
              class="text-2xs text-ink-muted hover:text-ink transition-colors" :class="yearModalPage === 0 ? 'opacity-30 cursor-not-allowed' : ''">◀</button>
            <span class="text-2xs text-ink-faint">{{ yearModalPage + 1 }} / {{ totalYearModalPages }}</span>
            <button type="button" @click="yearModalPage++" :disabled="yearModalPage >= totalYearModalPages - 1"
              class="text-2xs text-ink-muted hover:text-ink transition-colors" :class="yearModalPage >= totalYearModalPages - 1 ? 'opacity-30 cursor-not-allowed' : ''">▶</button>
          </div>
          <div class="flex justify-end mt-3 pt-2 border-t border-border">
            <button type="button" @click="jumpToCurrentYear" class="btn btn-primary btn-sm text-2xs">This year</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Month selector modal (Daily tab only) -->
    <Teleport to="body">
      <div v-if="showMonthModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showMonthModal = false">
        <div class="bg-surface-3 border border-border-strong rounded-xl w-72 p-4 shadow-2xl">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-medium text-ink">Select month</p>
            <button type="button" class="text-ink-faint hover:text-ink transition-colors" aria-label="Close" @click="showMonthModal = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between mb-3">
            <button type="button" class="p-1 rounded hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors" aria-label="Previous year" @click="monthModalYear--">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <p class="text-xs font-semibold text-ink">{{ monthModalYear }}</p>
            <button type="button" class="p-1 rounded hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors" aria-label="Next year" @click="monthModalYear++">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="(label, i) in MONTH_LABELS" :key="label"
              @click="selectMonthFromModal(i + 1)"
              type="button"
              class="py-2 text-2xs rounded-md border transition-colors relative"
              :class="selectedYear === monthModalYear && selectedMonth === i + 1
                ? 'bg-brand/10 border-brand text-brand font-medium'
                : 'bg-surface-4 border-border text-ink hover:border-border-strong'">
              {{ label }}
              <span v-if="availableMonthsInModalYear.has(i + 1) && !(selectedYear === monthModalYear && selectedMonth === i + 1)"
                class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand"></span>
            </button>
          </div>
          <div class="flex justify-end mt-3 pt-2 border-t border-border">
            <button type="button" @click="clearMonthFilter" class="btn btn-primary btn-sm text-2xs">Show all</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Quarter selector modal (Weekly tab only) -->
    <Teleport to="body">
      <div v-if="showQuarterModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showQuarterModal = false">
        <div class="bg-surface-3 border border-border-strong rounded-xl w-72 p-4 shadow-2xl">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-medium text-ink">Select quarter</p>
            <button type="button" class="text-ink-faint hover:text-ink transition-colors" aria-label="Close" @click="showQuarterModal = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between mb-3">
            <button type="button" class="p-1 rounded hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors" aria-label="Previous year" @click="quarterModalYear--">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <p class="text-xs font-semibold text-ink">{{ quarterModalYear }}</p>
            <button type="button" class="p-1 rounded hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors" aria-label="Next year" @click="quarterModalYear++">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="q in [1, 2, 3, 4]" :key="q"
              @click="selectQuarterFromModal(q)"
              type="button"
              class="py-3 text-2xs rounded-md border transition-colors relative"
              :class="selectedYear === quarterModalYear && selectedQuarter === q
                ? 'bg-brand/10 border-brand text-brand font-medium'
                : 'bg-surface-4 border-border text-ink hover:border-border-strong'">
              Q{{ q }}
              <span v-if="availableQuartersInModalYear.has(q) && !(selectedYear === quarterModalYear && selectedQuarter === q)"
                class="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand"></span>
            </button>
          </div>
          <div class="flex justify-end mt-3 pt-2 border-t border-border">
            <button type="button" @click="clearQuarterFilter" class="btn btn-primary btn-sm text-2xs">Show all</button>
          </div>
        </div>
      </div>
    </Teleport>

    <CheckinModal
      v-if="showCheckinModal && selected"
      :key="selected.key"
      :questions="journalStore.checklistQuestions"
      :date-label="selected.label || formatDate(selected.date)"
      :initial-answers="checkinAnswers"
      @save="saveCheckin"
      @skip="skipCheckin" />

    <ImageLightbox
      :visible="lightboxOpen"
      :src="entryImageUrl"
      :alt="selected ? (selected.label || formatDate(selected.date)) + ' chart' : ''"
      @close="lightboxOpen = false" />

    <TradeDrawer v-if="selectedTrade" :trade="selectedTrade" @close="selectedTrade = null" />

  </div>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { confirm: $confirm } = useConfirm()
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore }   from '@/stores/trades'
import { useJournalStore }  from '@/stores/journal'
import { useTimezoneStore } from '@/stores/timezone'
import { useCashEventsStore } from '@/stores/cashEvents'
import { fmt, fmtPct, computeDrawdownFromEvents } from '@/lib/stats'
import { format, parseISO, getYear, getMonth, addDays, endOfMonth } from 'date-fns'
import { requestCloudRefresh } from '@/lib/cloudSync'
import { useToast } from '@/composables/useToast'

import DayChart    from '@/components/charts/DayChart.vue'
import QuillEditor from '@/components/ui/QuillEditor.vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import DatePickerCalendar from '@/components/ui/DatePickerCalendar.vue'
import CheckinModal from '@/components/ui/CheckinModal.vue'
import CheckinCard from '@/components/ui/CheckinCard.vue'
import ImageLightbox from '@/components/ui/ImageLightbox.vue'
import { useImageStorageStore } from '@/stores/imageStorage'
import { useChartImage } from '@/composables/useChartImage'
import { useCheckin } from '@/composables/useCheckin'
import draggable from 'vuedraggable'
import CompactValue from '@/components/ui/CompactValue.vue'
import TradeDrawer from '@/components/logs/TradeDrawer.vue'

const tradesStore     = useTradesStore()
const journalStore    = useJournalStore()
const tzStore         = useTimezoneStore()
const cashEventsStore = useCashEventsStore()
const toast           = useToast()

const TRADE_PAGE_SIZE = 4
const pageSizeByTab = { daily: 7, weekly: 8, monthly: 8 }
const PAGE_SIZE = computed(() => pageSizeByTab[activeTab.value] || 7)

const activeTab      = ref('daily')
const selectedYear   = ref(new Date().getFullYear())
// Daily and Weekly both start narrowed to "now" (current month / current
// quarter) for a consistent default across tabs — Daily because a full
// year can run up to ~250 entries (≈36 pages), Weekly because, even though
// its own volume (<=52/year, ≈7 pages) was never really a pagination
// problem on its own, matching Daily's narrowed-by-default behavior reads
// more predictable than one tab starting narrowed and the other not.
// Monthly (<=12/year) has no narrower tier at all; it stays year-only.
// Either narrowing can be lifted again with "Show all" in its picker,
// which sets it back to null. See currentEntries below.
const selectedMonth   = ref(new Date().getMonth() + 1)            // 1-12 | null, Daily only
const selectedQuarter = ref(Math.floor(new Date().getMonth() / 3) + 1) // 1-4  | null, Weekly only
const selected       = ref(null)

// Checkin modal and chart-image attachment are both self-contained concerns
// that only react to `selected` — split out to composables so this file
// stays focused on entry list/CRUD, pagination, and sections.
const { showCheckinModal, checkinAnswers, saveCheckin, skipCheckin } = useCheckin(selected)
const {
  chartFileInput, lightboxOpen, entryImageUrl, hasImageFolder, entryImage,
  onChartFileSelected, removeChartImage, clearBrokenImage,
} = useChartImage(selected)

// imageStorageStore is also needed directly here for the one-time restore()
// call in onMounted below (same singleton instance useChartImage uses).
const imageStorageStore = useImageStorageStore()

// Cheap fingerprint of only the fields DayChart/dayStats actually read —
// deliberately excludes notes/tags/strategy/chartImage so editing a
// trade's notes doesn't look like a "change" here.
function tradesFingerprint(trades) {
  return trades.map(t => `${t.id}|${t.pnl}|${t.fees}|${t.gross_pnl}|${t.sold_at}|${t.bought_at}|${t.qty}|${t.symbol}`).join(';')
}

// Keep the currently-open entry's trade data in sync when the underlying
// trades store changes (e.g. after a new CSV import), without discarding
// any unsaved edits the user has made to the journal sections.
//
// tradesStore.trades is reassigned to a brand-new array on every
// keystroke typed into any trade's notes (TradeDrawer's updateTrade()
// rebuilds the whole array for a one-field edit) — not just when trades
// are actually added/changed/removed. Comparing a content fingerprint
// before reassigning `selected.value.trades` means a notes/tags/
// strategy/chartImage-only edit never touches it, so DayChart's
// `:trades` prop reference stays stable and its deep-watch doesn't
// destroy/rebuild the chart on every keystroke typed anywhere else.
watch(() => tradesStore.trades, () => {
  if (!selected.value) return
  const map = { daily: journalStore.dailyEntries, weekly: journalStore.weeklyEntries, monthly: journalStore.monthlyEntries }
  const list = map[selected.value.type] || []
  const fresh = list.find(e => e.key === selected.value.key)
  if (fresh) {
    if (tradesFingerprint(fresh.trades) !== tradesFingerprint(selected.value.trades)) {
      selected.value.trades = fresh.trades
    }
    if ('weekStart' in fresh) selected.value.weekStart = fresh.weekStart
    if ('weekEnd' in fresh) selected.value.weekEnd = fresh.weekEnd
  }
}, { deep: false })

// If this view auto-selects an entry (below, in onMounted) before
// App.vue's cloud load has finished, `selected` gets cloned from
// dailyEntries/weeklyEntries/monthlyEntries while journalStore.data is
// still empty — so `entry.sections` was just the default placeholder,
// and cloneEntry froze that into `selected.value`. Once the real cloud
// content arrives a moment later, dailyEntries recomputes correctly, but
// nothing was re-syncing the already-cloned `selected.value.sections` to
// match — same gap the trades watch above exists to close for `trades`.
// Net effect: a note that really does exist in the cloud rendered as
// empty until the entry was re-clicked or the page was hard-reloaded.
//
// Only acts once, on the loaded:false→true transition (not on every
// later edit `data` reassignment), and only overwrites `sections` if it's
// still exactly the untouched default placeholder — so it can never
// clobber a real edit the user already started typing into that brief
// window before the cloud data showed up.
watch(() => journalStore.loaded, (loaded, prevLoaded) => {
  if (!loaded || prevLoaded || !selected.value) return
  const map = { daily: journalStore.dailyEntries, weekly: journalStore.weeklyEntries, monthly: journalStore.monthlyEntries }
  const defaultsFor = {
    daily: journalStore.defaultSections,
    weekly: journalStore.weeklyDefaultSections,
    monthly: journalStore.monthlyDefaultSections,
  }
  const list = map[selected.value.type] || []
  const fresh = list.find(e => e.key === selected.value.key)
  if (!fresh) return
  const stillDefault = JSON.stringify(selected.value.sections) === JSON.stringify(defaultsFor[selected.value.type]?.())
  if (stillDefault && JSON.stringify(fresh.sections) !== JSON.stringify(selected.value.sections)) {
    selected.value.sections = fresh.sections.map(s => ({ ...s }))
  }
})

const showAddSection   = ref(false)
const showYearModal    = ref(false) // Monthly tab only
const showMonthModal   = ref(false) // Daily tab
const showQuarterModal = ref(false) // Weekly tab
// Which year's month/quarter grid the picker panel is browsing — separate
// from the committed selectedYear so arrowing through years in the panel
// doesn't change the list until an actual month/quarter is clicked (synced
// to selectedYear whenever the panel opens; see openPeriodPicker).
const monthModalYear   = ref(selectedYear.value)
const quarterModalYear = ref(selectedYear.value)
// Which page of the Year modal's 3x3 grid is showing — unlike the month/
// quarter modals (which browse one year at a time), the year grid pages
// through however many years of data exist, newest first, 9 per page
// instead of scrolling. Synced to whichever page contains the committed
// selectedYear whenever the modal opens; see openPeriodPicker.
const YEAR_MODAL_PAGE_SIZE = 9
const yearModalPage = ref(0)
const page           = ref(0)
const tradePage      = ref(0)
const selectedTrade  = ref(null)

const tabs = computed(() => [
  { id: 'daily',   label: 'Daily',   unread: journalStore.unreadDaily },
  { id: 'weekly',  label: 'Weekly',  unread: journalStore.unreadWeekly },
  { id: 'monthly', label: 'Monthly', unread: 0 },
])

const currentEntries = computed(() => {
  const map = { daily: journalStore.dailyEntries, weekly: journalStore.weeklyEntries, monthly: journalStore.monthlyEntries }
  return (map[activeTab.value] || []).filter(e => {
    const year = e.date ? getYear(parseISO(e.date)) : (e.year ?? (e.weekStart ? getYear(new Date(e.weekStart)) : new Date().getFullYear()))
    if (year !== selectedYear.value) return false
    if (activeTab.value === 'daily') {
      if (selectedMonth.value == null) return true // cleared — every entry in the year
      if (!e.date) return false
      return getMonth(parseISO(e.date)) + 1 === selectedMonth.value
    }
    if (activeTab.value === 'weekly') {
      if (selectedQuarter.value == null) return true // cleared — every entry in the year
      if (!e.weekStart) return false
      const q = Math.floor(getMonth(new Date(e.weekStart)) / 3) + 1
      return q === selectedQuarter.value
    }
    return true
  })
})

const availableYears = computed(() => {
  const all = [
    ...journalStore.dailyEntries,
    ...journalStore.weeklyEntries,
    ...journalStore.monthlyEntries,
  ]
  const years = new Set(all.map(e => e.date ? getYear(parseISO(e.date)) : (e.year ?? (e.weekStart ? getYear(new Date(e.weekStart)) : new Date().getFullYear()))))
  return [...years].sort((a, b) => b - a)
})

const totalYearModalPages = computed(() => Math.max(1, Math.ceil(availableYears.value.length / YEAR_MODAL_PAGE_SIZE)))
const pagedYearModalYears = computed(() =>
  availableYears.value.slice(yearModalPage.value * YEAR_MODAL_PAGE_SIZE, (yearModalPage.value + 1) * YEAR_MODAL_PAGE_SIZE))

// Which page the committed selectedYear falls on, so opening the modal (or
// jumping to the current year) lands on the page that actually shows it
// instead of always resetting to page 1.
function pageForYear(year) {
  const idx = availableYears.value.indexOf(year)
  return idx === -1 ? 0 : Math.floor(idx / YEAR_MODAL_PAGE_SIZE)
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Which months of `monthModalYear` have at least one daily entry — drives
// the dot under each month cell in the "Jump to month" panel.
const availableMonthsInModalYear = computed(() => {
  const months = new Set()
  for (const e of journalStore.dailyEntries) {
    if (!e.date) continue
    const d = parseISO(e.date)
    if (getYear(d) === monthModalYear.value) months.add(getMonth(d) + 1)
  }
  return months
})

// Which quarters of `quarterModalYear` have at least one weekly entry —
// drives the dot under each quarter cell in the "Select quarter" panel.
const availableQuartersInModalYear = computed(() => {
  const quarters = new Set()
  for (const e of journalStore.weeklyEntries) {
    if (!e.weekStart) continue
    const d = new Date(e.weekStart)
    if (getYear(d) === quarterModalYear.value) quarters.add(Math.floor(getMonth(d) / 3) + 1)
  }
  return quarters
})

// "March 2026" for Daily (or just "2026" once cleared), "Q1 2026" for
// Weekly once a quarter's picked (or just "2026" once cleared/unset), just
// "2026" for Monthly — shown under the tabs row and in the empty-state
// message.
const periodLabel = computed(() => {
  if (activeTab.value === 'daily') {
    if (selectedMonth.value == null) return String(selectedYear.value)
    return `${MONTH_LABELS[selectedMonth.value - 1]} ${selectedYear.value}`
  }
  if (activeTab.value === 'weekly' && selectedQuarter.value != null) {
    return `Q${selectedQuarter.value} ${selectedYear.value}`
  }
  return String(selectedYear.value)
})

function openPeriodPicker() {
  if (activeTab.value === 'daily') {
    monthModalYear.value = selectedYear.value
    showMonthModal.value = true
  } else if (activeTab.value === 'weekly') {
    quarterModalYear.value = selectedYear.value
    showQuarterModal.value = true
  } else {
    yearModalPage.value = pageForYear(selectedYear.value)
    showYearModal.value = true
  }
}

// "This year" — jumps straight to the current year, same idea as the
// Daily/Weekly pickers' own "Show all" button resetting their narrowing.
function jumpToCurrentYear() {
  const year = new Date().getFullYear()
  selectedYear.value = year
  yearModalPage.value = pageForYear(year)
  showYearModal.value = false
  page.value = 0
}

function selectMonthFromModal(month) {
  selectedYear.value  = monthModalYear.value
  selectedMonth.value = month
  showMonthModal.value = false
  page.value = 0
}

// "Clear" — lifts the month narrowing back to "every entry in the year",
// same as Weekly's un-narrowed default, while keeping whatever year was
// being browsed in the panel.
function clearMonthFilter() {
  selectedYear.value  = monthModalYear.value
  selectedMonth.value = null
  showMonthModal.value = false
  page.value = 0
}

function selectQuarterFromModal(q) {
  selectedYear.value    = quarterModalYear.value
  selectedQuarter.value = q
  showQuarterModal.value = false
  page.value = 0
}

// "Clear" — lifts the quarter narrowing back to "every entry in the year".
function clearQuarterFilter() {
  selectedYear.value    = quarterModalYear.value
  selectedQuarter.value = null
  showQuarterModal.value = false
  page.value = 0
}

const totalPages  = computed(() => Math.ceil(currentEntries.value.length / PAGE_SIZE.value))
const pagedEntries = computed(() => currentEntries.value.slice(page.value * PAGE_SIZE.value, (page.value + 1) * PAGE_SIZE.value))

const pagedTrades = computed(() => {
  if (!selected.value) return []
  const sorted = [...selected.value.trades].sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at))
  return sorted.slice(tradePage.value * TRADE_PAGE_SIZE, (tradePage.value + 1) * TRADE_PAGE_SIZE)
})
const totalTradePagesForEntry = computed(() => Math.ceil((selected.value?.trades.length || 0) / TRADE_PAGE_SIZE))

// Entry lists by tab (as getters, so they stay reactive).
const entryLists = {
  daily:   () => journalStore.dailyEntries,
  weekly:  () => journalStore.weeklyEntries,
  monthly: () => journalStore.monthlyEntries,
}

// Keys that already have a note in the active tab — the picker shows
// "Open note →" instead of "Create note" for these.
const existingNoteKeys = computed(() => (entryLists[activeTab.value]?.() || []).map(e => e.key))

const detailPanel = ref(null)

// Deep-clone just enough of an entry (its sections array) so in-progress
// edits in the detail panel don't mutate the store's copy until persistEntry
// actually saves them.
function cloneEntry(entry) {
  return { ...entry, sections: entry.sections.map(s => ({ ...s })) }
}

// The check-in modal is meant to prompt for whatever checklist answers
// are still missing — not to re-ask questions that are already answered.
// A day can have real answers already (synced from another device,
// answered earlier and only just now opened, etc.) even while it's still
// unread, so this checks the answers themselves rather than relying on
// `isRead` as a proxy for "has this been checked in on". Uses the
// CURRENT question set, not just "any answers exist at all" — if a
// question was added after this day was answered, it's still missing.
function checklistFullyAnswered(key) {
  const answers = journalStore.getChecklistAnswers(key)
  const questions = journalStore.checklistQuestions
  if (!questions.length) return true
  return questions.every(q => answers[q.id] != null)
}

// Opening an entry is the clearest "I want to see current data" signal
// there is — more direct than switching tabs or pages, which only refresh
// on the coarser 15s window (lib/cloudSync.js). This uses its own tighter
// 5s window instead: clicking a specific note is a deliberate, pointed
// request for its current content, worth bypassing the page-level
// throttle for (requestCloudRefresh's `force`), while still not firing one
// request per click when arrowing quickly through a long list of entries.
//
// `lastEntryRefreshAt` is ALSO set from onMounted, right after
// journalStore.whenLoaded() resolves there — without that, landing on
// this page did its own navigation-triggered journal refresh AND THEN
// immediately fired a second, separate one here for whatever entry got
// auto-selected, a few hundred ms apart, for data that had just that
// moment finished loading. Treating "the load we just waited for" as a
// refresh for throttling purposes closes that gap.
const ENTRY_REFRESH_MIN_INTERVAL = 5000
let lastEntryRefreshAt = 0
async function refreshSelectedEntryFromCloud(key, type) {
  const now = Date.now()
  if (now - lastEntryRefreshAt < ENTRY_REFRESH_MIN_INTERVAL) return
  lastEntryRefreshAt = now
  await requestCloudRefresh(['journal'], { force: true })
  // The user may have already clicked on to a different entry by the
  // time this resolves — only apply it to whatever's still actually open.
  if (!selected.value || selected.value.key !== key) return
  const map = { daily: journalStore.dailyEntries, weekly: journalStore.weeklyEntries, monthly: journalStore.monthlyEntries }
  const fresh = (map[type] || []).find(e => e.key === key)
  if (fresh) selected.value.sections = fresh.sections.map(s => ({ ...s }))
}

// Keyed by entry key, populated by the :ref callback on each sidebar row —
// lets selectEntry() scroll the now-selected row into view (below) without
// querying the DOM by hand. Entries fall out of the map on their own as
// pagedEntries re-renders (the callback runs with el=null on unmount).
const entryRefs = new Map()
function setEntryRef(key, el) {
  if (el) entryRefs.set(key, el)
  else entryRefs.delete(key)
}

function selectEntry(entry) {
  const wasUnread = !entry.isRead
  selected.value = cloneEntry(entry)
  showAddSection.value = false
  tradePage.value = 0
  journalStore.markRead(entry.key)
  // Journal-only refresh (below) is enough for opening a note — the
  // journal/trades/cashEvents refresh this page also needs is already
  // covered by the router's own per-page refresh on actually navigating
  // here (lib/cloudSync.js), so clicking between entries you're already
  // looking at has no reason to redo that too.
  refreshSelectedEntryFromCloud(entry.key, entry.type)

  nextTick(() => {
    if (detailPanel.value) detailPanel.value.scrollTop = 0
    // Bring the selected row into view in the sidebar list — matters most
    // right after a Calendar "jump to this entry" or a page/filter change
    // lands the selection somewhere off-screen (a different page of the
    // paginated list, or scrolled out of the visible sidebar), where the
    // highlighted row alone isn't enough for the user to actually see it.
    entryRefs.get(entry.key)?.scrollIntoView({ block: 'nearest' })
    if (entry.type === 'daily' && wasUnread && !checklistFullyAnswered(entry.key)) {
      showCheckinModal.value = true
    }
  })
}

// ── "+ New" picker ───────────────────────────────────────────────────────
// Create the picked day/week/month's note, then open it.
function createNote(key) {
  const defaults = { daily: journalStore.defaultSections, weekly: journalStore.weeklyDefaultSections, monthly: journalStore.monthlyDefaultSections }
  journalStore.setSections(key, defaults[activeTab.value]())
  focusEntryKey(activeTab.value, key)
}

// The period already has a note — just jump to it.
function openNote(key) { focusEntryKey(activeTab.value, key) }

// Select an entry by key. Stale year/month/quarter/page filters left over
// from earlier browsing could hide it from the sidebar, so they're pointed
// at its period first; the lookup retries a few ticks because a brand-new
// entry may not be in the list yet.
function focusEntryKey(tab, key) {
  suppressAutoSelect = true
  selectedYear.value = Number(key.slice(0, 4))
  if (tab === 'daily') selectedMonth.value = Number(key.slice(5, 7))
  if (tab === 'weekly') selectedQuarter.value = null
  page.value = 0

  function trySelect(attempt) {
    const entry = entryLists[tab]().find(e => e.key === key)
    if (entry) {
      // A week can start in the previous calendar year (e.g. W01), which is
      // the year the sidebar filters on — follow the entry, not the key.
      if (entry.weekStart) selectedYear.value = getYear(new Date(entry.weekStart))
      suppressAutoSelect = false
      selectEntry(entry)
      return
    }
    if (attempt < 3) { nextTick(() => trySelect(attempt + 1)); return }
    suppressAutoSelect = false
    console.error(`focusEntryKey: "${key}" not found in ${tab}Entries`)
    toast.error("Couldn't open the note — try clicking it from the list.")
  }
  nextTick(() => trySelect(0))
}

async function confirmDelete(entry) {
  const label = entry.label || formatDate(entry.date)
  if (!await $confirm({ title: 'Delete Journal Notes', message: 'Trade data will not be affected.', confirmLabel: 'Delete', danger: true })) return
  const currentIndex = currentEntries.value.findIndex(e => e.key === entry.key)
  journalStore.deleteEntry(entry.key)
  // Auto focus next available entry
  const next = currentEntries.value[currentIndex] || currentEntries.value[currentIndex - 1] || currentEntries.value[0]
  selected.value = next ? cloneEntry(next) : null
}

function persistEntry() {
  if (!selected.value) return
  journalStore.setSections(selected.value.key, selected.value.sections)
}

function removeSection(id) {
  if (!selected.value) return
  selected.value.sections = selected.value.sections.filter(s => s.id !== id)
  persistEntry()
}

function addSection(preset) {
  if (!selected.value) return
  selected.value.sections.push({ id: preset.title.toLowerCase() + '_' + Date.now(), ...preset, content: '' })
  showAddSection.value = false
  persistEntry()
}

const sectionPresets = [
  { emoji: '🧠', title: 'Thesis',     placeholder: 'What was your thesis?' },
  { emoji: '🎯', title: 'Entry',      placeholder: 'How did you enter?' },
  { emoji: '📈', title: 'Management', placeholder: 'How did you manage?' },
  { emoji: '📝', title: 'Review',     placeholder: 'What went well? What to improve?' },
  { emoji: '💡', title: 'Lessons',    placeholder: 'Key takeaways.' },
  { emoji: '😤', title: 'Emotions',   placeholder: 'How were you feeling?' },
  { emoji: '📋', title: 'Notes',      placeholder: 'Any other notes...' },
]

const dayStats = computed(() => {
  if (!selected.value) return { pnl: 0, fees: 0, wins: 0, losses: 0, breakeven: 0, gross: 0, total: 0 }
  const trades = selected.value.trades
  return {
    pnl:       Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100,
    fees:      Math.round(trades.reduce((s, t) => s + (t.fees || 0), 0) * 100) / 100,
    // Win/Loss/Breakeven classification uses GROSS P&L (before fees) — matches NinjaTrader convention
    wins:      trades.filter(t => (t.gross_pnl ?? t.pnl) > 0).length,
    losses:    trades.filter(t => (t.gross_pnl ?? t.pnl) < 0).length,
    breakeven: trades.filter(t => (t.gross_pnl ?? t.pnl) === 0).length,
    gross:     Math.round(trades.reduce((s, t) => s + (t.gross_pnl ?? t.pnl), 0) * 100) / 100,
    total:     trades.length,
  }
})

const statItems = computed(() => {
  const s = dayStats.value

  // Determine date range for this entry (day, week, or month)
  let from, to
  if (selected.value.type === 'daily') {
    from = selected.value.date
    to   = selected.value.date
  } else if (selected.value.type === 'weekly') {
    from = format(selected.value.weekStart, 'yyyy-MM-dd')
    to   = format(addDays(selected.value.weekStart, 4), 'yyyy-MM-dd')
  } else {
    // monthly
    const [y, m] = selected.value.key.split('-').map(Number)
    from = `${y}-${String(m).padStart(2, '0')}-01`
    to   = format(endOfMonth(new Date(y, m - 1, 1)), 'yyyy-MM-dd')
  }

  const isDaily = selected.value.type === 'daily'
  const { maxDrawdown, realizedHighPnl } = computeDrawdownFromEvents(cashEventsStore.events, from, to + 'T23:59:59', isDaily)

  return [
    { label: 'Total Trades',     value: String(s.total),  class: 'text-ink',  tip: 'Number of trades closed.' },
    { label: 'Gross P&L',        raw: s.gross,            class: s.gross >= 0 ? 'text-up' : 'text-down', tip: 'P&L before fees.' },
    { label: 'Win / BE / Loss',  value: `${s.wins}/${s.breakeven}/${s.losses}`, class: 'text-ink', tip: 'Winning, breakeven, and losing trades based on gross P&L (before fees).' },
    { label: 'Win Rate',         value: s.total ? fmtPct((s.wins / s.total) * 100) : '—', class: s.total && s.wins / s.total >= 0.5 ? 'text-up' : 'text-down', tip: 'Percentage of trades with positive gross P&L (before fees).' },
    { label: 'Realized High',    raw: realizedHighPnl,    class: 'text-up', tip: 'Maximum cumulative realized P&L, computed from closed trades including fees at time of charge.' },
    { label: 'Max Drawdown',     raw: -maxDrawdown,       class: maxDrawdown > 0 ? 'text-down' : 'text-ink', tip: 'Maximum peak-to-trough equity decline, computed from realized cash flow including fees at time of charge.' },
    { label: 'Fees',             raw: -s.fees,            class: 'text-down', tip: 'Total fees paid.' },
  ]
})

function formatDate(date) {
  if (!date) return ''
  try { return format(parseISO(date), 'EEE, MMM d, yyyy') } catch { return date }
}

// Switching tab, year, or (for Daily) month / (for Weekly) quarter all mean
// "the entry list just changed out from under the selection" — reset to
// page 1 and re-select the first entry.
//
// Set right before openEntryInJournal/focusEntryKey change
// any of the refs below, when they're about to select a SPECIFIC entry of
// their own rather than "whatever's first now" — without this, changing
// those refs also runs this watcher, which raced those functions' own
// nextTick-based selection to decide what ends up selected. Whichever one's
// nextTick happened to resolve last won, so it only looked broken
// sometimes: jumping to an entry already on page 1 of the current filters
// (nothing to actually change here, so this watcher never even fired) kept
// working, while jumping to one that changed selectedYear/selectedMonth/
// selectedQuarter (a different month, a past year, Calendar's "jump to
// last month's entry") could lose that race and get silently overwritten
// back to "whatever's first" the instant this watcher's own nextTick ran.
// Checking the flag synchronously, before scheduling this watcher's
// nextTick at all, removes the race outright rather than trying to out-time
// it.
let suppressAutoSelect = false
watch([activeTab, selectedYear, selectedMonth, selectedQuarter], () => {
  page.value = 0
  selected.value = null
  if (suppressAutoSelect) return
  nextTick(() => {
    if (currentEntries.value.length) selectEntry(currentEntries.value[0])
  })
})

const route  = useRoute()
const router = useRouter()

// Shared by the Calendar page's "jump to this day/week's journal entry"
// links (?date=... / ?week=...) — same steps either way: switch tab, switch
// year (and, for Daily, month — its list is also scoped by month now), then
// find and select the matching entry once the list updates.
function openEntryInJournal(tab, key) {
  // Those tab/year/quarter changes just below also fire the watch a few
  // lines up (any filter change resets to page 1 and auto-selects whatever
  // entry is now first in the list) — that's a second, competing selection
  // racing this one. suppressAutoSelect (set before any of those refs
  // change) stops that watch from even scheduling its own "select the
  // first entry" the instant it runs, so this function's own selection
  // below is the only one that ends up happening — no race to time against.
  // (Jumping to an entry whose year/month/quarter already matches what's
  // currently selected never even triggers that watch, which is why this
  // only ever showed up jumping to a DIFFERENT month/year — e.g. Calendar's
  // "jump to last month's entry" — and not to one already on screen.)
  suppressAutoSelect = true
  activeTab.value = tab
  selectedYear.value = Number(key.slice(0, 4))
  if (tab === 'daily') selectedMonth.value = Number(key.slice(5, 7))
  // A `yyyy-Www` week key doesn't cleanly map to a quarter without extra
  // date math, so rather than compute it, just clear any active quarter
  // filter — same reasoning as the selectedYear/page reset below: a stale
  // filter from earlier browsing shouldn't be able to hide the entry a
  // Calendar-page link is specifically trying to jump to.
  if (tab === 'weekly') selectedQuarter.value = null

  function trySelect(attempt) {
    const idx = currentEntries.value.findIndex(e => e.key === key)
    if (idx !== -1) {
      suppressAutoSelect = false
      page.value = Math.floor(idx / PAGE_SIZE.value)
      selectEntry(currentEntries.value[idx])
      return
    }
    if (attempt < 3) { nextTick(() => trySelect(attempt + 1)); return }
    suppressAutoSelect = false
  }
  nextTick(() => trySelect(0))
}

function onYearModalKeydown(e) {
  if (e.key !== 'Escape') return
  if (showYearModal.value) showYearModal.value = false
  if (showMonthModal.value) showMonthModal.value = false
  if (showQuarterModal.value) showQuarterModal.value = false
}
onMounted(() => document.addEventListener('keydown', onYearModalKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onYearModalKeydown))

onMounted(async () => {
  await imageStorageStore.restore()
  // Wait for the journal cloud load App.vue already kicked off on
  // sign-in before auto-selecting anything below — otherwise, landing on
  // Journal as the first page after signing in could select/clone an
  // entry while journalStore.data is still empty, freezing an empty
  // placeholder snapshot that the watch below then has to repair after
  // the fact. Waiting here means that watch is just a backstop now, not
  // the only thing standing between this view and a stale snapshot.
  await journalStore.whenLoaded()
  // journalStore.data is as fresh as it's about to get for the moment —
  // count this as the entry-refresh's own "just refreshed", so whichever
  // entry gets auto-selected just below doesn't immediately trigger a
  // second, redundant journal reload (its `force: true` would otherwise
  // bypass the page-level throttle and refetch anyway) on top of the one
  // just awaited.
  lastEntryRefreshAt = Date.now()
  const { date, week } = route.query
  if (date) {
    openEntryInJournal('daily', date)
    router.replace({ query: {} }) // clear query so a refresh doesn't re-trigger
  } else if (week) {
    openEntryInJournal('weekly', week)
    router.replace({ query: {} })
  } else if (currentEntries.value.length) {
    selectEntry(currentEntries.value[0])
  }
})
</script>

<style scoped>
.section-ghost {
  opacity: 0.4;
}
.section-dragging {
  cursor: grabbing;
}
</style>
