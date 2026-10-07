<template>
  <div class="relative" ref="root">
    <button type="button" ref="triggerBtn"
      class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-surface-3 hover:border-border-strong transition-colors text-left"
      @click="toggleOpen">
      <span class="w-5 h-5 rounded-md bg-brand/10 border border-brand/30 flex items-center justify-center flex-shrink-0 text-2xs font-semibold text-brand">
        {{ initial }}
      </span>
      <span class="text-xs text-ink font-medium truncate flex-1">{{ activeName }}</span>
      <svg class="w-3 h-3 text-ink-faint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <polyline v-if="open" points="18 15 12 9 6 15"/>
        <polyline v-else points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <!-- Teleported + fixed-positioned so it's never clipped by the sidebar's
         own overflow, same approach as ui/Dropdown.vue. -->
    <Teleport to="body">
      <div v-if="open" ref="panelEl"
        class="fixed bg-surface-3 border border-border rounded-lg shadow-2xl z-[60] max-h-72 overflow-y-auto"
        :style="panelStyle">
        <p class="text-2xs text-ink-faint font-medium px-3 pt-2.5 pb-1.5">Portfolios</p>
        <div v-for="a in accountsStore.accounts" :key="a.id"
          class="group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md hover:bg-surface-4 transition-colors">
          <button type="button" class="flex items-center gap-2 flex-1 min-w-0 text-left" @click="pick(a.id)">
            <svg v-if="a.id === accountsStore.activeAccountId" class="w-3.5 h-3.5 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span v-else class="w-3.5 h-3.5 flex-shrink-0"></span>
            <span class="text-xs truncate" :class="a.id === accountsStore.activeAccountId ? 'text-ink font-medium' : 'text-ink-muted'">{{ a.name }}</span>
          </button>
          <button type="button" class="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-ink transition-opacity flex-shrink-0" aria-label="Rename" @click="startRename(a)">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button v-if="accountsStore.accounts.length > 1" type="button" class="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-down transition-opacity flex-shrink-0" aria-label="Delete" @click="startDelete(a)">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
        <button type="button"
          class="block w-full text-left px-3 py-2 text-2xs text-brand hover:bg-surface-4 border-t border-border transition-colors"
          @click="startAdd">
          + Add portfolio
        </button>
      </div>
    </Teleport>

    <AddTextItemModal v-if="showAdd"
      label="Portfolio" placeholder="e.g. Main Account"
      :existing-names="accountsStore.accounts.map(a => a.name)"
      @add="confirmAdd"
      @cancel="showAdd = false" />

    <AddTextItemModal v-if="renaming"
      is-edit
      label="Portfolio" placeholder="e.g. Main Account"
      :initial-text="renaming.name"
      :existing-names="accountsStore.accounts.filter(a => a.id !== renaming.id).map(a => a.name)"
      @add="confirmRename"
      @cancel="renaming = null" />
  </div>
</template>

<script setup>
// Portfolio switcher — lets the user pick which separate broker/prop account
// (accounts.js) is "active" (one at a time, not a combined view), and manage
// the list (add/rename/delete). Switching fires App.vue's
// watch(() => accountsStore.activeAccountId, ...), which reloads every
// per-portfolio store (trades/balance/cashEvents/journal/rawCsvArchive).
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useConfirm } from '@/composables/useConfirm'
import AddTextItemModal from '@/components/ui/AddTextItemModal.vue'

const accountsStore = useAccountsStore()
const { confirm: $confirm } = useConfirm()

const open = ref(false)
const root = ref(null)
const triggerBtn = ref(null)
const panelEl = ref(null)
const panelStyle = ref('')
const showAdd = ref(false)
const renaming = ref(null) // the account object currently being renamed, or null

const activeName = computed(() => accountsStore.activeAccount?.name || 'Portfolio')
const initial = computed(() => (activeName.value[0] || 'P').toUpperCase())

async function toggleOpen() {
  if (open.value) { open.value = false; return }
  open.value = true
  await nextTick()
  updatePanelPosition()
}

function updatePanelPosition() {
  if (!triggerBtn.value || !panelEl.value) return
  const rect = triggerBtn.value.getBoundingClientRect()
  const panelH = panelEl.value.offsetHeight
  const margin = 6

  // Now that the trigger lives at the bottom of the sidebar (above
  // Export & Restore), opening straight below like before would run the
  // panel off the bottom of the screen — so, same as ui/Dropdown.vue,
  // prefer below but flip above the trigger when there isn't room.
  const spaceBelow = window.innerHeight - rect.bottom
  const showAbove = spaceBelow < panelH + margin && rect.top > panelH + margin
  const top = showAbove ? rect.top - panelH - margin : rect.bottom + margin

  panelStyle.value = `top:${top}px; left:${rect.left}px; min-width:${rect.width}px; max-width:260px;`
}

function pick(id) {
  if (id !== accountsStore.activeAccountId) accountsStore.setActive(id)
  open.value = false
}

function startRename(a) {
  renaming.value = a
}
async function confirmRename(name) {
  const a = renaming.value
  renaming.value = null
  if (a && name !== a.name) await accountsStore.renameAccount(a.id, name)
}

function startAdd() {
  open.value = false
  showAdd.value = true
}
async function confirmAdd(name) {
  showAdd.value = false
  const created = await accountsStore.createAccount(name)
  if (created) accountsStore.setActive(created.id)
}

async function startDelete(a) {
  const ok = await $confirm({
    title: `Delete "${a.name}"?`,
    message: 'This permanently deletes every trade, journal entry, balance record and cash event in this portfolio. This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  await accountsStore.deleteAccount(a.id)
}

function onClickOutside(e) {
  if (!open.value) return
  const insideTrigger = root.value && root.value.contains(e.target)
  const insidePanel = panelEl.value && panelEl.value.contains(e.target)
  if (!insideTrigger && !insidePanel) open.value = false
}
onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>
