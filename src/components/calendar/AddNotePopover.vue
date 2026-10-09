<template>
  <Teleport to="body">
    <div v-if="target" class="fixed inset-0 z-[60]" @click="$emit('cancel')">
      <div class="fixed bg-surface-3 border border-border-strong rounded-xl shadow-2xl p-3.5 w-56 space-y-2.5"
        :style="style" @click.stop>
        <div>
          <p class="text-sm font-semibold text-ink">{{ format(target.date, 'EEE, MMM d') }}</p>
          <p class="text-2xs text-ink-faint mt-0.5">{{ summary }}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm flex-1" @click="$emit('cancel')">Close</button>
          <button class="btn btn-primary btn-sm flex-1" @click="$emit('confirm')">
            {{ target.hasEntry ? 'Open note' : 'Create note' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { format } from 'date-fns'
import { fmt } from '@/lib/stats'

// target: { date, rect, hasEntry, hasNote, trades, pnl } — see useCalendarNotes.
const props = defineProps({ target: { type: Object, default: null } })
const emit = defineEmits(['confirm', 'cancel'])

const summary = computed(() => {
  const t = props.target
  if (!t) return ''
  const trades = t.trades ? `${t.trades} trade${t.trades !== 1 ? 's' : ''} · ${fmt(t.pnl)}` : 'No trades'
  return `${trades} · ${t.hasNote ? 'Has note' : 'No note yet'}`
})

// Fixed-positioned under the clicked cell (same approach as
// PortfolioSwitcher), nudged left if it would run off the right edge.
const style = computed(() => {
  if (!props.target) return ''
  const { rect } = props.target
  const width = 224 // w-56
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  return `top:${rect.bottom + 6}px; left:${left}px;`
})

function onKey(e) { if (e.key === 'Escape') emit('cancel') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
