<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black" @click.self="close">
      <div class="relative" :style="{ width: containerWidth + 'px', height: containerHeight + 'px' }">
        <div ref="scrollBox"
          class="w-full h-full overflow-auto rounded-lg bg-black/20"
          :class="zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''"
          @wheel="onWheel"
          @mousedown="onPanStart">
          <div class="flex items-center justify-center min-w-full min-h-full" :style="{ width: imgWidth ? imgWidth + 'px' : 'auto', height: imgHeight ? imgHeight + 'px' : 'auto' }">
            <img ref="imgEl" :src="src" :alt="alt"
              class="select-none"
              :style="{ width: imgWidth + 'px', height: imgHeight + 'px' }"
              draggable="false"
              @load="onImageLoad"
              @dblclick="toggleDoubleClickZoom" />
          </div>
        </div>

        <div class="absolute -top-3 -right-3">
          <TooltipWrap tip="Close">
            <button class="w-8 h-8 rounded-full bg-surface-2 border border-border text-ink flex items-center justify-center hover:bg-surface-3" @click="close">
              ✕
            </button>
          </TooltipWrap>
        </div>

        <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-2/95 border border-border rounded-lg px-2 py-1.5">
          <TooltipWrap tip="Zoom out">
            <button class="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors" @click="zoomOut" :disabled="zoom <= MIN_ZOOM">−</button>
          </TooltipWrap>
          <span class="text-2xs text-ink-muted w-10 text-center font-mono">{{ Math.round(zoom * 100) }}%</span>
          <TooltipWrap tip="Zoom in">
            <button class="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors" @click="zoomIn" :disabled="zoom >= MAX_ZOOM">+</button>
          </TooltipWrap>
          <button class="text-2xs text-ink-muted hover:text-ink px-2 transition-colors" @click="zoom = 1; fitImage()">Reset</button>
        </div>
      </div>
      <div v-if="alt" class="absolute bottom-3 w-full text-center text-xs text-ink-muted">{{ alt }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'

const props = defineProps({
  src:     { type: String, default: null },
  alt:     { type: String, default: '' },
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

function close() { emit('close') }

// Esc closes the viewer while it's open.
function onKeydown(e) {
  if (e.key === 'Escape' && props.visible) close()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const scrollBox = ref(null)
const imgEl = ref(null)
const zoom = ref(1)
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

const naturalWidth  = ref(0)
const naturalHeight = ref(0)
const baseWidth  = ref(0)
const baseHeight = ref(0)
const maxW = ref(0)
const maxH = ref(0)
const imgWidth  = computed(() => Math.round(baseWidth.value * zoom.value))
const imgHeight = computed(() => Math.round(baseHeight.value * zoom.value))
const containerWidth  = computed(() => baseWidth.value  || maxW.value)
const containerHeight = computed(() => baseHeight.value || maxH.value)

const WIDTH_PRESETS = [1280, 1440, 1920, 2560, 3840]
function presetWidthFor(screenWidth) {
  let chosen = WIDTH_PRESETS[0]
  for (const w of WIDTH_PRESETS) {
    if (screenWidth >= w) chosen = w
    else break
  }
  return chosen
}

function onImageLoad(e) {
  naturalWidth.value  = e.target.naturalWidth
  naturalHeight.value = e.target.naturalHeight
  fitImage()
}

function fitImage() {
  if (!naturalWidth.value) return
  maxW.value = presetWidthFor(window.innerWidth) * 0.9
  maxH.value = window.innerHeight * 0.85
  const scale = Math.min(maxW.value / naturalWidth.value, maxH.value / naturalHeight.value, 1)
  // Round here so the container (sized off baseWidth/baseHeight directly)
  // and the image (sized off imgWidth/imgHeight, which round baseWidth *
  // zoom) always agree on whole pixels. A fractional baseWidth otherwise
  // rounds differently in each place — e.g. container at 799.6px next to
  // an image rounded up to 800px — and that sub-pixel mismatch is enough
  // for the browser to show a scrollbar even at 100% zoom.
  baseWidth.value  = Math.round(naturalWidth.value * scale)
  baseHeight.value = Math.round(naturalHeight.value * scale)
}

function zoomIn()  { zoom.value = Math.min(MAX_ZOOM, Math.round((zoom.value + ZOOM_STEP) * 100) / 100) }
function zoomOut() { zoom.value = Math.max(MIN_ZOOM, Math.round((zoom.value - ZOOM_STEP) * 100) / 100) }
function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const delta = -e.deltaY * 0.01
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((zoom.value + delta) * 100) / 100))
}
function toggleDoubleClickZoom() {
  zoom.value = zoom.value === 1 ? 2 : 1
}

// Click-and-drag panning once zoomed in — the scroll box already scrolls,
// this just lets the person drag the image instead of hunting for
// scrollbars.
const isPanning = ref(false)
let panStartX = 0, panStartY = 0, panStartScrollLeft = 0, panStartScrollTop = 0

function onPanStart(e) {
  if (zoom.value <= 1 || !scrollBox.value) return
  isPanning.value = true
  panStartX = e.clientX
  panStartY = e.clientY
  panStartScrollLeft = scrollBox.value.scrollLeft
  panStartScrollTop  = scrollBox.value.scrollTop
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanEnd)
  e.preventDefault()
}
function onPanMove(e) {
  if (!isPanning.value || !scrollBox.value) return
  scrollBox.value.scrollLeft = panStartScrollLeft - (e.clientX - panStartX)
  scrollBox.value.scrollTop  = panStartScrollTop  - (e.clientY - panStartY)
}
function onPanEnd() {
  isPanning.value = false
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
})

watch(() => props.visible, (v) => {
  if (v) {
    zoom.value = 1
    naturalWidth.value = 0
    naturalHeight.value = 0
    // A cached image can finish loading before Vue's @load listener is
    // attached, so it never fires and fitImage() never runs. Fall back to
    // checking img.complete directly once the element exists.
    nextTick(() => {
      if (imgEl.value?.complete && imgEl.value.naturalWidth) onImageLoad({ target: imgEl.value })
    })
  }
})
</script>
