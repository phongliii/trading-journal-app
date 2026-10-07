<template>
  <div class="p-6 space-y-5 w-full min-w-[1000px]">

    <!-- Key analytics cards -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Total Fees"
        :raw-value="tradesStore.totalFees > 0 ? -tradesStore.totalFees : 0"
        value-class="text-down"
        :sub="tradesStore.totalFees > 0 ? `avg ${fmt(tradesStore.totalFees / (stats.total || 1))} / trade` : 'No fee data'"
        tooltip="Total commissions and exchange fees paid." />
      <StatCard label="Expectancy" :value="fmt(stats.expectancy)"
        :value-class="stats.expectancy >= 0 ? 'text-up' : 'text-down'"
        sub="Avg $ per trade"
        tooltip="Average profit or loss per trade, across all closed trades." />
      <StatCard label="Max Drawdown" :raw-value="-stats.maxDrawdown"
        value-class="text-down"
        sub="Peak to trough"
        tooltip="Maximum peak-to-trough equity decline, computed from realized cash flow including fees at time of charge." />
      <StatCard label="Consec. Wins" :value="String(stats.maxConsecWins)"
        value-class="text-up"
        :sub="`Max losing streak: ${stats.maxConsecLosses}`"
        tooltip="Longest streak of consecutive winning trades." />
    </section>

    <!-- Equity curve -->
    <section class="bg-surface-2 border border-border rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <p class="text-xs font-medium text-ink">Equity Curve</p>
        <div class="flex gap-4 text-xs text-ink-muted">
          <span>{{ stats.total }} trades</span>
          <span class="font-mono font-semibold" :class="stats.totalPnl >= 0 ? 'text-up' : 'text-down'">
            <CompactValue :value="stats.totalPnl" /> net
          </span>
        </div>
      </div>
      <div class="h-56">
        <EquityCurve :curve="stats.equityCurve" />
      </div>
    </section>

    <!-- 2-col: month + DOW -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-surface-2 border border-border rounded-xl p-5">
        <p class="text-xs font-medium text-ink mb-4">Monthly Breakdown</p>
        <BarList :items="tradesStore.monthPerf" />
      </div>
      <div class="bg-surface-2 border border-border rounded-xl p-5">
        <p class="text-xs font-medium text-ink mb-4">Day of Week Breakdown</p>
        <BarList :items="tradesStore.dowPerf" />
      </div>
    </section>

    <!-- Symbol table -->
    <section class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <p class="text-xs font-medium text-ink">Performance by Symbol</p>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Trades</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win Rate</th>
              <th>Total P&L</th>
              <th>Avg P&L</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in tradesStore.symbolPerf" :key="s.symbol">
              <td class="font-mono font-semibold text-ink">{{ s.symbol }}</td>
              <td class="font-mono">{{ s.trades }}</td>
              <td class="font-mono text-up">{{ s.wins }}</td>
              <td class="font-mono text-down">{{ s.trades - s.wins }}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="w-16 bar-track">
                    <div class="bar-fill-up" :style="{ width: s.winRate + '%' }"></div>
                  </div>
                  <span class="font-mono text-xs" :class="s.winRate >= 50 ? 'text-up' : 'text-down'">{{ fmtPct(s.winRate) }}</span>
                </div>
              </td>
              <td class="font-mono font-semibold" :class="s.pnl >= 0 ? 'text-up' : 'text-down'"><CompactValue :value="s.pnl" /></td>
              <td class="font-mono text-xs" :class="(s.pnl/s.trades) >= 0 ? 'text-up' : 'text-down'">{{ fmt(s.pnl/s.trades) }}</td>
            </tr>
            <tr v-if="tradesStore.symbolPerf.length === 0">
              <td colspan="7" class="text-center text-ink-faint py-8 text-xs">No data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { fmt, fmtPct } from '@/lib/stats'
import StatCard    from '@/components/ui/StatCard.vue'
import CompactValue from '@/components/ui/CompactValue.vue'
import BarList     from '@/components/ui/BarList.vue'
import EquityCurve from '@/components/charts/EquityCurve.vue'

const tradesStore = useTradesStore()
const stats = computed(() => tradesStore.stats)
</script>
