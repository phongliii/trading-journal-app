<template>
  <div class="p-6 w-full max-w-[900px] min-w-[600px] space-y-5">

    <!-- Timezone -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Time</h2>
      </div>
      <div class="divide-y divide-border">
        <!-- Auto toggle row -->
        <div class="flex items-center justify-between px-5 py-4">
          <span class="text-sm text-ink">Set time zone automatically using your current location</span>
          <button @click="tzStore.setAuto(!tzStore.autoDetect)"
            class="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
            :class="tzStore.autoDetect ? 'bg-brand' : 'bg-surface-4'">
            <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              :class="tzStore.autoDetect ? 'translate-x-5' : 'translate-x-0'"></span>
          </button>
        </div>
        <!-- Timezone row -->
        <div class="flex items-center justify-between px-5 py-4">
          <span class="text-sm" :class="tzStore.autoDetect ? 'text-ink-faint' : 'text-ink'">Time Zone</span>
          <div class="text-right">
            <span v-if="tzStore.autoDetect" class="text-sm text-ink-faint">{{ tzStore.timezoneName }}</span>
            <Dropdown v-else v-model="manualTzValue" :options="timezoneOptions" />
          </div>
        </div>
      </div>
    </div>

    <!-- Balance Threshold Alert -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-ink">Balance Threshold Alert</h2>
          <p class="text-xs text-ink-faint mt-0.5">Toast reminder when your balance reaches the amount below.</p>
        </div>
        <button @click="withdrawReminderStore.setEnabled(!withdrawReminderStore.enabled)"
          class="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
          :class="withdrawReminderStore.enabled ? 'bg-brand' : 'bg-surface-4'">
          <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
            :class="withdrawReminderStore.enabled ? 'translate-x-5' : 'translate-x-0'"></span>
        </button>
      </div>
      <div class="px-5 py-4" :class="!withdrawReminderStore.enabled ? 'opacity-50 pointer-events-none' : ''">
        <label class="input-label">Amount</label>
        <div class="relative max-w-[200px]">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint text-sm">$</span>
          <input type="number" min="0" step="0.01"
            class="input pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="e.g. 1000"
            v-model="withdrawAmount"
            @keydown.enter="$event.target.blur()" />
        </div>
        <p class="text-2xs text-ink-faint mt-2">Starts on the first trading day of the week and repeats daily until a withdrawal is imported from a Cash History file, then goes quiet until next week.</p>
      </div>
    </div>

    <!-- Fund Transactions -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Fund Transactions</h2>
      </div>
      <div class="p-5 space-y-4">
        <!-- No fund transactions hint -->
        <div v-if="!balanceStore.fundTransactions.length" class="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3">
          <svg class="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-xs text-ink-muted">No fund transactions yet — import <span class="text-ink font-medium">Cash_History.csv</span> along with Position History to track deposits and withdrawals.</p>
        </div>

        <!-- Fund transactions list -->
        <div v-else class="bg-surface-3 rounded-lg overflow-hidden">
          <div class="grid grid-cols-3 items-center px-3 py-2 border-b border-border">
            <span class="text-2xs font-semibold uppercase tracking-wide text-ink-faint text-left">Date</span>
            <span class="text-2xs font-semibold uppercase tracking-wide text-ink-faint text-center">Type</span>
            <span class="text-2xs font-semibold uppercase tracking-wide text-ink-faint text-right">Amount</span>
          </div>
          <div class="divide-y divide-border">
            <div v-for="t in pagedFundTxns" :key="t.date + t.amount"
              class="grid grid-cols-3 items-center px-3 py-2">
              <span class="text-xs text-ink-muted text-left">{{ t.date }}</span>
              <span class="text-xs font-mono font-semibold capitalize text-ink-muted text-center">{{ t.type }}</span>
              <span class="font-mono text-xs font-semibold text-right" :class="t.amount >= 0 ? 'text-up' : 'text-down'">
                {{ t.amount >= 0 ? '+' : '' }}${{ Math.abs(t.amount).toFixed(2) }}
              </span>
            </div>
          </div>
          <div v-if="fundTotalPages > 1" class="flex items-center justify-between px-3 py-2 border-t border-border">
            <button @click="fundPage--" :disabled="fundPage === 0" class="btn btn-ghost btn-sm text-2xs" :class="fundPage === 0 ? 'opacity-30' : ''" title="Previous page">◀</button>
            <span class="text-2xs text-ink-faint">{{ fundPage + 1 }} / {{ fundTotalPages }}</span>
            <button @click="fundPage++" :disabled="fundPage >= fundTotalPages - 1" class="btn btn-ghost btn-sm text-2xs" :class="fundPage >= fundTotalPages - 1 ? 'opacity-30' : ''" title="Next page">▶</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Data Management -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Data Management</h2>
      </div>
      <div class="p-5 space-y-5">

        <!-- Chart images -->
        <div>
          <p class="text-2xs font-medium text-ink-faint uppercase tracking-wide mb-2">Chart images</p>

          <div v-if="!imageStorageStore.isSupported" class="flex items-center gap-3 bg-down/5 border border-down/20 rounded-lg px-4 py-3">
            <svg class="w-4 h-4 text-down flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-xs text-ink-muted">Not supported in this browser. Chart images require Chrome or Edge.</p>
          </div>

          <template v-else>
            <div v-if="!imageStorageStore.folderName" class="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3 mb-3">
              <svg class="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-xs text-ink-muted">Choose a folder on your device where chart screenshots attached to journal entries will be saved.</p>
            </div>
            <div v-else-if="imageStorageStore.needsPermission" class="flex items-center gap-3 bg-warn/5 border border-warn/20 rounded-lg px-4 py-3 mb-3">
              <svg class="w-4 h-4 text-warn flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-xs text-ink-muted flex-1">Access to <span class="text-ink font-mono font-medium">{{ imageStorageStore.folderName }}</span> needs to be reconfirmed for this session.</p>
              <TooltipWrap tip="Disconnect">
                <button class="text-ink-faint hover:text-down transition-colors flex-shrink-0" @click="clearImageFolder">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244M3 3l18 18"/>
                </svg>
                </button>
              </TooltipWrap>
            </div>
            <div v-else class="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3 mb-3">
              <svg class="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              <p class="text-xs text-ink-muted font-mono flex-1">{{ imageStorageStore.folderName }}</p>
              <TooltipWrap tip="Disconnect">
                <button class="text-ink-faint hover:text-down transition-colors flex-shrink-0" @click="clearImageFolder">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244M3 3l18 18"/>
                </svg>
                </button>
              </TooltipWrap>
            </div>

            <div v-if="imageStorageStore.folderName && !imageStorageStore.needsPermission" class="grid grid-cols-2 gap-2.5 mb-3">
              <div class="bg-surface-3 rounded-lg px-3 py-2.5">
                <div class="text-2xs text-ink-faint mb-1">Images stored</div>
                <div class="font-mono text-sm font-semibold text-ink">{{ imageStorageStore.imageCount }}</div>
              </div>
              <div class="bg-surface-3 rounded-lg px-3 py-2.5">
                <div class="text-2xs text-ink-faint mb-1">Total size</div>
                <div class="font-mono text-sm font-semibold text-ink">{{ imageStorageSize }}</div>
              </div>
            </div>

            <div class="flex gap-2 items-center flex-wrap">
              <button v-if="imageStorageStore.needsPermission" class="btn btn-ghost btn-sm" @click="reconnectImageFolder">Allow access again</button>
              <button v-else class="btn btn-ghost btn-sm" @click="chooseImageFolder">
                {{ imageStorageStore.folderName ? 'Change folder' : 'Choose folder' }}
              </button>
              <button
                v-if="imageStorageStore.folderName && !imageStorageStore.needsPermission"
                class="btn btn-danger btn-sm"
                :disabled="!imageStorageStore.imageCount"
                @click="clearAllImages">
                Clear all images
              </button>
            </div>
          </template>
        </div>

        <!-- Account balance -->
        <div class="border-t border-border pt-5">
          <p class="text-2xs font-medium text-ink-faint uppercase tracking-wide mb-2">Account balance</p>

          <div v-if="!balanceStore.hasBalance" class="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3">
            <svg class="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-xs text-ink-muted">Import an Account Balance History file to enable balance tracking.</p>
          </div>
          <div v-else class="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3">
            <svg class="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M5 13l4 4L19 7"/>
            </svg>
            <p class="text-xs text-ink-muted flex-1">Starting balance imported. Balance tracking is active.</p>
            <TooltipWrap tip="Delete">
              <button class="text-ink-faint hover:text-down transition-colors flex-shrink-0" @click="clearBalance">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              </button>
            </TooltipWrap>
          </div>
        </div>

      </div>
    </div>

    <!-- Daily Check-in Questions -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Daily Check-in Questions</h2>
        <p class="text-xs text-ink-muted mt-0.5">Shown the first time you open each daily journal entry. Drag to reorder.</p>
      </div>
      <div class="p-5">
        <draggable
          v-model="checklistDraft"
          item-key="id"
          handle=".checklist-drag-handle"
          animation="200"
          class="space-y-2 mb-3"
          @end="saveChecklistDraft">
          <template #item="{ element: q }">
            <div class="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-3 py-2">
              <span class="checklist-drag-handle text-ink-faint/50 hover:text-ink-faint cursor-grab active:cursor-grabbing select-none">⠿</span>
              <span class="flex-1 text-xs text-ink">{{ q.text }}</span>
              <span
                class="text-2xs px-2 py-1 rounded"
                :class="q.yesIsGood ? 'text-up bg-up/10' : 'text-down bg-down/10'">
                {{ q.yesIsGood ? 'Yes = good' : 'Yes = bad' }}
              </span>
              <TooltipWrap tip="Edit">
                <button class="text-ink-faint hover:text-ink transition-colors" @click="editingQuestion = q">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                </button>
              </TooltipWrap>
              <TooltipWrap tip="Delete">
                <button class="text-ink-faint hover:text-down transition-colors" @click="removeChecklistQuestion(q.id)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                </button>
              </TooltipWrap>
            </div>
          </template>
        </draggable>
        <button @click="showAddQuestion = true" class="text-xs text-brand hover:underline">+ Add question</button>
      </div>
    </div>

    <AddQuestionModal v-if="showAddQuestion"
      :existing-texts="checklistDraft.map(q => q.text)"
      @add="addChecklistQuestion"
      @cancel="showAddQuestion = false" />

    <AddQuestionModal v-if="editingQuestion"
      is-edit
      :initial-text="editingQuestion.text"
      :initial-yes-is-good="editingQuestion.yesIsGood"
      :existing-texts="checklistDraft.filter(q => q.id !== editingQuestion.id).map(q => q.text)"
      @add="saveEditedQuestion"
      @cancel="editingQuestion = null" />

    <!-- Notes: Tags and Strategies pick-lists used on individual trade notes -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Notes</h2>
        <p class="text-xs text-ink-muted mt-0.5">Tags and strategies offered on individual trade notes. Drag to reorder.</p>
      </div>
      <div class="p-5 space-y-6">

        <div>
          <p class="text-2xs font-medium text-ink-faint uppercase tracking-wide mb-2">Tags</p>
          <draggable
            v-model="tagMetaDraft"
            item-key="id"
            handle=".tag-drag-handle"
            animation="200"
            class="space-y-2 mb-3"
            @end="saveTagMetaDraft">
            <template #item="{ element: item }">
              <div class="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-3 py-2">
                <span class="tag-drag-handle text-ink-faint/50 hover:text-ink-faint cursor-grab active:cursor-grabbing select-none">⠿</span>
                <span class="flex-1 text-xs text-ink">{{ item.text }}</span>
                <TooltipWrap tip="Edit">
                  <button class="text-ink-faint hover:text-ink transition-colors" @click="editingTagItem = item">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </TooltipWrap>
                <TooltipWrap tip="Delete">
                  <button class="text-ink-faint hover:text-down transition-colors" @click="removeTagMetaItem(item.id)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </TooltipWrap>
              </div>
            </template>
          </draggable>
          <button @click="showAddTag = true" class="text-xs text-brand hover:underline">+ Add tag</button>
        </div>

        <div>
          <p class="text-2xs font-medium text-ink-faint uppercase tracking-wide mb-2">Strategies</p>
          <draggable
            v-model="strategyMetaDraft"
            item-key="id"
            handle=".strategy-drag-handle"
            animation="200"
            class="space-y-2 mb-3"
            @end="saveStrategyMetaDraft">
            <template #item="{ element: item }">
              <div class="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-3 py-2">
                <span class="strategy-drag-handle text-ink-faint/50 hover:text-ink-faint cursor-grab active:cursor-grabbing select-none">⠿</span>
                <span class="flex-1 text-xs text-ink">{{ item.text }}</span>
                <TooltipWrap tip="Edit">
                  <button class="text-ink-faint hover:text-ink transition-colors" @click="editingStrategyItem = item">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </TooltipWrap>
                <TooltipWrap tip="Delete">
                  <button class="text-ink-faint hover:text-down transition-colors" @click="removeStrategyMetaItem(item.id)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </TooltipWrap>
              </div>
            </template>
          </draggable>
          <button @click="showAddStrategy = true" class="text-xs text-brand hover:underline">+ Add strategy</button>
        </div>

      </div>
    </div>

    <AddTextItemModal v-if="showAddTag"
      label="Tag" placeholder="e.g. Breakout"
      :existing-names="tagMetaDraft.map(t => t.text)"
      @add="addTagMetaItem"
      @cancel="showAddTag = false" />

    <AddTextItemModal v-if="editingTagItem"
      is-edit
      label="Tag" placeholder="e.g. Breakout"
      :initial-text="editingTagItem.text"
      :existing-names="tagMetaDraft.filter(t => t.id !== editingTagItem.id).map(t => t.text)"
      @add="saveEditedTagItem"
      @cancel="editingTagItem = null" />

    <AddTextItemModal v-if="showAddStrategy"
      label="Strategy" placeholder="e.g. ORB Reversal"
      :existing-names="strategyMetaDraft.map(s => s.text)"
      @add="addStrategyMetaItem"
      @cancel="showAddStrategy = false" />

    <AddTextItemModal v-if="editingStrategyItem"
      is-edit
      label="Strategy" placeholder="e.g. ORB Reversal"
      :initial-text="editingStrategyItem.text"
      :existing-names="strategyMetaDraft.filter(s => s.id !== editingStrategyItem.id).map(s => s.text)"
      @add="saveEditedStrategyItem"
      @cancel="editingStrategyItem = null" />

    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-ink">Storage</h2>
          <p class="text-xs text-ink-muted mt-0.5">Your data is saved to your Supabase account.</p>
        </div>
        <span class="flex items-center gap-1.5 text-xs font-medium text-brand">
          <span class="w-2 h-2 rounded-full bg-brand"></span>
          Cloud
        </span>
      </div>
      <div class="p-5 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-surface-3 rounded-lg px-3 py-2.5">
            <div class="text-2xs text-ink-faint mb-1">Trades stored</div>
            <div class="font-mono text-sm font-semibold text-ink">{{ tradesStore.trades.length }}</div>
          </div>
          <div class="bg-surface-3 rounded-lg px-3 py-2.5">
            <div class="text-2xs text-ink-faint mb-1">Last import</div>
            <div class="font-mono text-sm font-semibold text-ink">{{ lastImport }}</div>
          </div>
        </div>

        <div class="flex gap-2 pt-1 items-center">
          <button class="btn btn-danger btn-sm ml-auto" @click="resetAll">Reset</button>
        </div>
      </div>
    </div>

    <!-- Account -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Account</h2>
        <p class="text-xs text-ink-muted mt-0.5">Signed in via Supabase. New accounts are created by the app owner, not here.</p>
      </div>
      <div class="px-5 py-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-ink truncate">{{ authStore.user?.email || '—' }}</p>
          <p class="text-2xs text-ink-faint mt-0.5">Signed in</p>
        </div>
        <button class="btn btn-ghost btn-sm flex-shrink-0" @click="signOut">Sign out</button>
      </div>
    </div>

    <!-- SQL reference -->
    <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border">
        <h2 class="text-sm font-semibold text-ink">Supabase Table Schema</h2>
        <!-- Auth is wired up (this page's Account section above). The real
             schema below (every table carries user_id/account_id + Row
             Level Security) is finished and safe to run — but trades and
             everything else still live in localStorage: the app itself
             doesn't talk to these tables yet (lib/supabaseAdapter.js is the
             next piece of Phase 2), so running this now just has the
             tables sitting there ready, ahead of the app using them. -->
        <p class="text-xs text-ink-muted mt-0.5">The app saves everything to these tables. Run this once in the Supabase SQL editor to set them up — if you've already run it, you don't need to again.</p>
      </div>
      <div class="p-5">
        <div class="relative">
          <pre class="bg-surface-1 border border-border rounded-xl p-4 text-xs font-mono text-ink-muted overflow-x-auto leading-relaxed">{{ sql }}</pre>
          <button class="absolute top-3 right-3 btn btn-ghost btn-sm text-2xs" @click="copySql">
            {{ copied ? '✓ Copied' : 'Copy' }}
          </button>
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="text-xs text-ink-faint space-y-1 px-1">
      <p>EdgeLog v{{ appVersion }}</p>
    </div>

  </div>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { confirm: $confirm } = useConfirm()
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import { useTradesStore }   from '@/stores/trades'
import { useBalanceStore }  from '@/stores/balance'
import { useTimezoneStore } from '@/stores/timezone'
import { useAuthStore }     from '@/stores/auth'
import { useJournalStore }  from '@/stores/journal'
import { useImageStorageStore } from '@/stores/imageStorage'
import { useHolidayStore }  from '@/stores/holidays'
import { useCashEventsStore } from '@/stores/cashEvents'
import { useWithdrawReminderStore } from '@/stores/withdrawReminder'
import { useTradeMetaStore } from '@/stores/tradeMeta'
import { useAccountsStore } from '@/stores/accounts'
import { useRawCsvArchiveStore } from '@/stores/rawCsvArchive'
import { journalAdapter } from '@/lib/journalAdapter'
import { clearCloudSettings } from '@/lib/cloudSettings'
import { useToast }         from '@/composables/useToast'
import { format } from 'date-fns'
import draggable from 'vuedraggable'
import AddQuestionModal from '@/components/ui/AddQuestionModal.vue'
import AddTextItemModal from '@/components/ui/AddTextItemModal.vue'
import pkg from '../../package.json'
// The actual schema file, not a copy — this panel used to carry a
// hand-maintained template-string copy of the SQL that quietly drifted out
// of sync with the real src/lib/supabase.sql (it was still showing the old
// single-table, no-RLS dev scaffold after supabase.sql itself had moved on
// to the real Phase 2 schema). Importing it with Vite's `?raw` suffix means
// there's exactly one copy of this SQL in the codebase from here on.
import sql from '@/lib/supabase.sql?raw'
const appVersion = pkg.version

const router        = useRouter()
const authStore     = useAuthStore()
const tradesStore   = useTradesStore()
const balanceStore  = useBalanceStore()
const tzStore       = useTimezoneStore()
const journalStore  = useJournalStore()
const imageStorageStore = useImageStorageStore()
const withdrawReminderStore = useWithdrawReminderStore()
const tradeMetaStore = useTradeMetaStore()
const accountsStore = useAccountsStore()
const rawCsvArchiveStore = useRawCsvArchiveStore()
const withdrawAmount = computed({
  get: () => withdrawReminderStore.amount,
  set: (v) => {
    const n = Number(v)
    withdrawReminderStore.setAmount(v === '' || v === null || !Number.isFinite(n) ? null : n)
  },
})

const checklistDraft = ref(journalStore.checklistQuestions.map(q => ({ ...q })))
const showAddQuestion = ref(false)
const editingQuestion = ref(null)

const tagMetaDraft      = ref(tradeMetaStore.tags.map(t => ({ ...t })))
const strategyMetaDraft = ref(tradeMetaStore.strategies.map(s => ({ ...s })))
const showAddTag        = ref(false)
const showAddStrategy   = ref(false)
const editingTagItem      = ref(null)
const editingStrategyItem = ref(null)

function saveTagMetaDraft() {
  tradeMetaStore.setTags(tagMetaDraft.value.map(t => ({ ...t })))
}
function addTagMetaItem(text) {
  tradeMetaStore.addTagItem(text)
  tagMetaDraft.value = tradeMetaStore.tags.map(t => ({ ...t }))
  showAddTag.value = false
}
async function removeTagMetaItem(id) {
  if (!await $confirm({ title: 'Remove Tag', message: 'This tag will be permanently deleted from your Tags list. Trades that already use it will keep showing it, but it will no longer be selectable.', confirmLabel: 'Remove', danger: true })) return
  tradeMetaStore.removeTagItem(id)
  tagMetaDraft.value = tradeMetaStore.tags.map(t => ({ ...t }))
}
function saveEditedTagItem(text) {
  const item = tagMetaDraft.value.find(t => t.id === editingTagItem.value.id)
  if (item) {
    item.text = text
    saveTagMetaDraft()
  }
  editingTagItem.value = null
}

function saveStrategyMetaDraft() {
  tradeMetaStore.setStrategies(strategyMetaDraft.value.map(s => ({ ...s })))
}
function addStrategyMetaItem(text) {
  tradeMetaStore.addStrategyItem(text)
  strategyMetaDraft.value = tradeMetaStore.strategies.map(s => ({ ...s }))
  showAddStrategy.value = false
}
async function removeStrategyMetaItem(id) {
  if (!await $confirm({ title: 'Remove Strategy', message: 'This strategy will be permanently deleted from your Strategies list. Trades that already use it will keep showing it, but it will no longer be selectable.', confirmLabel: 'Remove', danger: true })) return
  tradeMetaStore.removeStrategyItem(id)
  strategyMetaDraft.value = tradeMetaStore.strategies.map(s => ({ ...s }))
}
function saveEditedStrategyItem(text) {
  const item = strategyMetaDraft.value.find(s => s.id === editingStrategyItem.value.id)
  if (item) {
    item.text = text
    saveStrategyMetaDraft()
  }
  editingStrategyItem.value = null
}

function saveChecklistDraft() {
  journalStore.setChecklistQuestions(checklistDraft.value.map(q => ({ ...q })))
}

function addChecklistQuestion({ text, yesIsGood }) {
  checklistDraft.value.push({ id: 'q_' + Date.now(), text, yesIsGood })
  saveChecklistDraft()
  showAddQuestion.value = false
}

function saveEditedQuestion({ text, yesIsGood }) {
  const q = checklistDraft.value.find(q => q.id === editingQuestion.value.id)
  if (q) {
    q.text = text
    q.yesIsGood = yesIsGood
    saveChecklistDraft()
  }
  editingQuestion.value = null
}

async function removeChecklistQuestion(id) {
  if (!await $confirm({ title: 'Remove Question', message: 'This check-in question and any answers already recorded for it will be permanently deleted and cannot be restored.', confirmLabel: 'Remove', danger: true })) return
  journalStore.removeChecklistQuestion(id)
  checklistDraft.value = journalStore.checklistQuestions.map(q => ({ ...q }))
}
const holidaysStore = useHolidayStore()
const cashEventsStore = useCashEventsStore()
const toast  = useToast()
const copied = ref(false)

// Manual timezone picker — the shared Dropdown component's modelValue,
// wired straight to the store like the other computed-setter pickers in
// this app (e.g. TradeDrawer's strategyDropdownValue).
const manualTzValue = computed({
  get: () => tzStore.manualTz || tzStore.browserTz,
  set: (v) => tzStore.setManual(v),
})
// Flattened, with each option's region carried as `group` so Dropdown can
// render the same region headers the old native <optgroup> list had.
const timezoneOptions = computed(() =>
  Object.entries(groupedTimezones).flatMap(([region, zones]) =>
    zones.map(tz => ({ ...tz, group: region }))
  )
)

const groupedTimezones = {
  'America': [
    { value: 'America/New_York',    label: 'New York (ET)' },
    { value: 'America/Chicago',     label: 'Chicago (CT)' },
    { value: 'America/Denver',      label: 'Denver (MT)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
    { value: 'America/Anchorage',   label: 'Anchorage (AKT)' },
    { value: 'Pacific/Honolulu',    label: 'Honolulu (HT)' },
    { value: 'America/Toronto',     label: 'Toronto' },
    { value: 'America/Vancouver',   label: 'Vancouver' },
    { value: 'America/Sao_Paulo',   label: 'São Paulo' },
    { value: 'America/Mexico_City', label: 'Mexico City' },
  ],
  'Europe': [
    { value: 'Europe/London',   label: 'London (GMT/BST)' },
    { value: 'Europe/Paris',    label: 'Paris (CET)' },
    { value: 'Europe/Berlin',   label: 'Berlin (CET)' },
    { value: 'Europe/Moscow',   label: 'Moscow (MSK)' },
    { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
  ],
  'Asia': [
    { value: 'Asia/Dubai',     label: 'Dubai (GST)' },
    { value: 'Asia/Kolkata',   label: 'Mumbai/Delhi (IST)' },
    { value: 'Asia/Bangkok',   label: 'Bangkok (ICT)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Asia/Shanghai',  label: 'Shanghai/Beijing (CST)' },
    { value: 'Asia/Tokyo',     label: 'Tokyo (JST)' },
    { value: 'Asia/Seoul',     label: 'Seoul (KST)' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  ],
  'Australia & Pacific': [
    { value: 'Australia/Sydney',   label: 'Sydney (AEST)' },
    { value: 'Australia/Perth',    label: 'Perth (AWST)' },
    { value: 'Pacific/Auckland',   label: 'Auckland (NZST)' },
  ],
}

const fundPage       = ref(0)
const FUND_PAGE_SIZE = 3
const pagedFundTxns  = computed(() => {
  const txns = [...balanceStore.fundTransactions].sort((a, b) => b.date.localeCompare(a.date))
  return txns.slice(fundPage.value * FUND_PAGE_SIZE, (fundPage.value + 1) * FUND_PAGE_SIZE)
})
const fundTotalPages = computed(() => Math.ceil(balanceStore.fundTransactions.length / FUND_PAGE_SIZE))

async function clearImageFolder() {
  if (!await $confirm({ title: 'Disconnect Chart Image Folder', message: 'You will need to choose a folder again to attach chart images. Existing images already saved will not be deleted.', confirmLabel: 'Disconnect', danger: true })) return
  await imageStorageStore.clearFolder()
  toast.info('Chart image folder disconnected')
}

async function chooseImageFolder() {
  const ok = await imageStorageStore.chooseFolder()
  if (ok) await imageStorageStore.refreshStats()
}

async function reconnectImageFolder() {
  const ok = await imageStorageStore.reconnect()
  if (ok) await imageStorageStore.refreshStats()
}

const imageStorageSize = computed(() => {
  const bytes = imageStorageStore.imageTotalBytes
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

async function clearAllImages() {
  if (!await $confirm({
    title: 'Clear All Chart Images',
    message: `This will permanently delete all ${imageStorageStore.imageCount} image${imageStorageStore.imageCount !== 1 ? 's' : ''} in the connected folder and remove them from any journal entries. This cannot be undone.`,
    confirmLabel: 'Delete All',
    danger: true,
  })) return
  try {
    await imageStorageStore.clearAllImages()
    journalStore.clearAllEntryImages()
    toast.info('All chart images cleared')
  } catch (e) {
    console.error(e)
    toast.error('Could not clear images: ' + e.message)
  }
}

async function clearBalance() {
  if (!await $confirm({ title: 'Clear Account Balance', message: 'This will permanently delete your starting balance and balance tracking. You\'ll need to re-import your Account Balance History file to set it up again.', confirmLabel: 'Clear', danger: true })) return
  balanceStore.clearBalance()
  toast.info('Account balance cleared')
}

const lastImport = computed(() => {
  if (!tradesStore.trades.length) return '—'
  const dates = tradesStore.trades
    .map(t => t.created_at)
    .filter(Boolean)
    .map(d => new Date(d))
    .sort((a, b) => b - a)
  if (!dates.length) return '—'
  try { return format(dates[0], 'MMM d') } catch { return '—' }
})

// Factory reset for the active account: deletes its trades, journal, balance,
// cash events and backed-up CSVs from the cloud, deletes the cloud settings
// row, then wipes this browser's local data — everything except the
// Supabase login token (`sb-…`), so you stay signed in. Cloud steps run
// first and abort on the first failure, so a half-failed reset never wipes
// the local side and can simply be retried.
async function resetAll() {
  if (!await $confirm({
    title: 'Reset Everything',
    message: 'This permanently deletes this account\'s trades, journal, balance, cash history and backed-up CSVs from the cloud, plus your tags, strategies, rules and other preferences. Local data on this browser is cleared too. You stay signed in. This cannot be undone.',
    confirmLabel: 'Reset Everything',
    danger: true
  })) return
  try {
    await tradesStore.clearAll()
    await balanceStore.clearBalance()
    await balanceStore.clearFundTransactions()
    await cashEventsStore.clearAll()
    await journalAdapter.clearAll(accountsStore.activeAccountId)
    await rawCsvArchiveStore.clearAll()
    await clearCloudSettings()
  } catch (e) {
    toast.error('Reset stopped — nothing local was cleared: ' + e.message)
    return
  }
  await imageStorageStore.clearFolder()
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('sb-')) localStorage.removeItem(key)
  }
  sessionStorage.clear()
  window.location.reload()
}

async function clearAll() {
  if (!await $confirm({ title: 'Delete All Trades', message: `Delete all ${tradesStore.trades.length} trades? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) return
  try {
    await tradesStore.clearAll()
  } catch (e) {
    toast.error('Could not clear trades: ' + e.message)
    return
  }
  toast.info('All trades cleared')
}

function signOut() {
  // authStore.signOut() clears local auth state synchronously (before its
  // own internal network call), so we can navigate right away instead of
  // waiting on it — that wait was the source of the lag on click.
  authStore.signOut()
  router.push('/login')
}

function copySql() {
  navigator.clipboard.writeText(sql).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}

onMounted(async () => {
  await imageStorageStore.restore()
  await imageStorageStore.refreshStats()
})
</script>
