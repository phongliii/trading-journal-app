import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

const TAGS_KEY       = 'edgelog:tradeMeta:tags'
const STRATEGIES_KEY = 'edgelog:tradeMeta:strategies'

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

// Master lists of Tags and Strategies, managed on the Settings page and
// offered as picklists on individual trade notes (Trade Drawer). Each item
// is { id, text }. Trades store the actual selections on themselves
// (trade.tags: string[], trade.strategy: string|null) — removing an item
// here does NOT touch trades that already reference it by text, so old
// values stay visible even if they're no longer in the list.
export const useTradeMetaStore = defineStore('tradeMeta', () => {
  const tags       = ref(load(TAGS_KEY))
  const strategies = ref(load(STRATEGIES_KEY))

  function saveTags()       { localStorage.setItem(TAGS_KEY, JSON.stringify(tags.value)); pushSettingsPatch({ tags: tags.value }) }
  function saveStrategies() { localStorage.setItem(STRATEGIES_KEY, JSON.stringify(strategies.value)); pushSettingsPatch({ strategies: strategies.value }) }

  // Tags and strategies sync as two separate keys in the cloud settings
  // blob (lib/cloudSettings.js), not one — they're independent lists with
  // independent add/remove UI, and bundling them would mean a cloud update
  // to one key always has to carry the other's current value along too.
  function applyTagsFromCloud(list) { tags.value = list; localStorage.setItem(TAGS_KEY, JSON.stringify(list)) }
  function tagsToCloudValue() { return tags.value }
  function applyStrategiesFromCloud(list) { strategies.value = list; localStorage.setItem(STRATEGIES_KEY, JSON.stringify(list)) }
  function strategiesToCloudValue() { return strategies.value }

  function setTags(list) { tags.value = list; saveTags() }
  function addTagItem(text) {
    const t = (text || '').trim()
    if (!t || tags.value.some(x => x.text.toLowerCase() === t.toLowerCase())) return
    tags.value.push({ id: 'tag_' + Date.now(), text: t })
    saveTags()
  }
  function removeTagItem(id) {
    tags.value = tags.value.filter(t => t.id !== id)
    saveTags()
  }

  function setStrategies(list) { strategies.value = list; saveStrategies() }
  function addStrategyItem(text) {
    const t = (text || '').trim()
    if (!t || strategies.value.some(x => x.text.toLowerCase() === t.toLowerCase())) return
    strategies.value.push({ id: 'strat_' + Date.now(), text: t })
    saveStrategies()
  }
  function removeStrategyItem(id) {
    strategies.value = strategies.value.filter(s => s.id !== id)
    saveStrategies()
  }

  return {
    tags, strategies,
    setTags, addTagItem, removeTagItem,
    setStrategies, addStrategyItem, removeStrategyItem,
    applyTagsFromCloud, tagsToCloudValue,
    applyStrategiesFromCloud, strategiesToCloudValue,
  }
})
