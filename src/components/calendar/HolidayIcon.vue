<template>
  <TooltipWrap :tip="isHoliday ? 'Remove holiday' : 'Mark as holiday'" class="flex-shrink-0">
    <button
      @click.stop="handleClick"
      class="transition-colors flex-shrink-0"
      :class="isHoliday ? 'text-yellow-400' : 'text-ink-muted/40 hover:text-yellow-400/60'">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <!-- Sun circle -->
        <circle cx="7" cy="6" r="2.5"/>
        <!-- Umbrella canopy -->
        <path d="M11 9 C11 5 17 3 20 7 C17 6 14 6 11 9z"/>
        <!-- Umbrella pole -->
        <line x1="14" y1="9" x2="12" y2="20"/>
        <!-- Pole bend -->
        <path d="M12 20 Q11 22 13 22"/>
        <!-- Water waves -->
        <path d="M2 16 Q4 14 6 16 Q8 18 10 16 Q12 14 14 16 Q16 18 18 16 Q20 14 22 16"/>
        <!-- Sand base -->
        <path d="M2 20 Q4 19 6 20 Q9 21 12 20 Q15 19 18 20 Q20 21 22 20" />
      </svg>
    </button>
  </TooltipWrap>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { confirm: $confirm } = useConfirm()
import { computed } from 'vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import { useHolidayStore } from '@/stores/holidays'
import { format } from 'date-fns'

const props = defineProps({ date: { type: Date, required: true } })
const holidayStore = useHolidayStore()
const dateStr   = computed(() => format(props.date, 'yyyy-MM-dd'))
const isHoliday = computed(() => holidayStore.isHoliday(dateStr.value))

async function handleClick() {
  const action = isHoliday.value ? 'Remove holiday from' : 'Mark as holiday'
  if (!await $confirm({ title: action, message: format(props.date, 'MMM d, yyyy'), confirmLabel: isHoliday.value ? 'Remove' : 'Mark Holiday', danger: isHoliday.value })) return
  holidayStore.toggleHoliday(dateStr.value)
}
</script>
