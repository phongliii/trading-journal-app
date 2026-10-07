<template>
  <!-- Stand-in for the real app shell (AppSidebar + AppTopbar + page content)
       shown (a) while the router's first navigation is still resolving (it
       awaits the auth guard — `page` is unset then, since the route isn't
       known yet) and (b) after the route IS known but the first cloud load
       hasn't landed yet (App.vue passes `page` = route.name there). Mirrors
       the real chrome's layout, and — once `page` is known — the shape of
       that specific page's own content too, so there's no visible jump
       once the real data mounts a moment later. -->
  <div class="flex-1 flex h-full overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface-1 h-full">
      <div class="flex items-center gap-2.5 px-5 h-14 border-b border-border flex-shrink-0">
        <Skeleton class="w-7 h-7 !rounded-lg" />
        <Skeleton class="h-3.5 w-20" />
      </div>
      <div class="flex-1 px-3 py-4 space-y-2">
        <Skeleton v-for="i in 4" :key="i" class="h-8 w-full !rounded-lg" />
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Topbar -->
      <header class="h-14 border-b border-border bg-surface-1 flex items-center justify-between px-6 flex-shrink-0">
        <Skeleton class="h-3.5 w-28" />
        <Skeleton class="h-7 w-24 !rounded-lg" />
      </header>

      <!-- Page content — shaped to match whichever page is actually behind it -->

      <!-- Dashboard: calendar strip, stat-card row, two rows of charts
           (mirrors DashboardView's own `tradesStore.loading` skeleton) -->
      <main v-if="page === 'dashboard'" class="flex-1 p-6 space-y-5 overflow-hidden">
        <Skeleton class="h-24 !rounded-xl" />
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Skeleton v-for="i in 5" :key="i" class="h-20 !rounded-xl" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton class="h-56 !rounded-xl" />
          <Skeleton class="h-56 !rounded-xl" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton class="h-72 !rounded-xl" />
          <Skeleton class="h-72 !rounded-xl" />
        </div>
      </main>

      <!-- Trades: toolbar, stat-card row, table rows (mirrors TradesView's
           own `tradesStore.loading` skeleton) -->
      <main v-else-if="page === 'trades'" class="flex-1 p-6 space-y-4 overflow-hidden">
        <div class="flex items-center gap-3">
          <Skeleton class="h-8 flex-1 max-w-xs !rounded-lg" />
          <Skeleton class="h-8 w-20 !rounded-lg" />
          <Skeleton class="h-8 w-20 !rounded-lg" />
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Skeleton v-for="i in 6" :key="i" class="h-16 !rounded-xl" />
        </div>
        <div class="bg-surface-2 border border-border rounded-xl p-4 space-y-2">
          <Skeleton v-for="i in 8" :key="i" class="h-7 w-full" />
        </div>
      </main>

      <!-- Calendar: nav row + a grid of day cells -->
      <main v-else-if="page === 'calendar'" class="flex-1 p-6 overflow-hidden">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <Skeleton class="h-7 w-7 !rounded-lg" />
            <Skeleton class="h-5 w-32 !rounded-md" />
            <Skeleton class="h-7 w-7 !rounded-lg" />
          </div>
          <Skeleton class="h-6 w-36 !rounded-full" />
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl overflow-hidden grid grid-cols-7">
          <Skeleton v-for="i in 35" :key="i" class="!rounded-none h-[88px] border-border" :class="i % 7 !== 0 ? 'border-r' : ''" />
        </div>
      </main>

      <!-- Journal: its own narrow entry-list column + a wide detail column
           — Journal has a second, in-page sidebar of its own in addition
           to the real AppSidebar at left, so this mirrors THAT split. -->
      <main v-else-if="page === 'journal'" class="flex-1 flex overflow-hidden">
        <div class="w-64 flex-shrink-0 border-r border-border p-3 space-y-2">
          <div class="flex items-center gap-1 mb-2">
            <Skeleton v-for="i in 3" :key="i" class="h-7 flex-1 !rounded-lg" />
            <Skeleton class="h-7 w-7 flex-shrink-0 !rounded-lg" />
          </div>
          <Skeleton v-for="i in 6" :key="'e' + i" class="h-12 w-full !rounded-lg" />
        </div>
        <div class="flex-1 p-8 space-y-5 overflow-hidden">
          <Skeleton class="h-7 w-52 !rounded-md" />
          <div class="grid grid-cols-4 xl:grid-cols-7 gap-3">
            <Skeleton v-for="i in 7" :key="i" class="h-14 !rounded-lg" />
          </div>
          <Skeleton class="h-32 w-full !rounded-xl" />
          <Skeleton class="h-40 w-full !rounded-xl" />
        </div>
      </main>

      <!-- Export & Settings: both are stacked/side-by-side cards, no table
           or chart shapes to mirror — a couple of card-sized blocks reads
           close enough to either layout. -->
      <main v-else-if="page === 'export'" class="flex-1 p-6 space-y-5 max-w-[900px]">
        <Skeleton class="h-6 w-48 !rounded-md" />
        <div class="grid grid-cols-2 gap-4">
          <Skeleton class="h-64 !rounded-xl" />
          <Skeleton class="h-64 !rounded-xl" />
        </div>
      </main>
      <main v-else-if="page === 'settings'" class="flex-1 p-6 space-y-5 max-w-[900px]">
        <Skeleton v-for="i in 3" :key="i" class="h-28 w-full !rounded-xl" />
      </main>

      <!-- Unknown page (route not resolved yet) — generic fallback -->
      <main v-else class="flex-1 p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Skeleton v-for="i in 5" :key="i" class="h-20 !rounded-xl" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton class="h-56 !rounded-xl" />
          <Skeleton class="h-56 !rounded-xl" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import Skeleton from '@/components/ui/Skeleton.vue'

defineProps({
  // Matches a router route name ('dashboard' | 'trades' | 'calendar' |
  // 'journal' | 'export' | 'settings'), or unset/null when the route isn't
  // resolved yet — see the `v-else` fallback above.
  page: { type: String, default: null },
})
</script>
