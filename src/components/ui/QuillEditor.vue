<template>
  <div>
    <!-- Custom toolbar -->
    <div class="flex items-center gap-0.5 mb-3 flex-wrap pb-2 border-b border-border/50">
      <TooltipWrap tip="Bold"><button @click="toggle('bold')"      :class="['tool', active.bold      ? 'tool-active' : '']"><b>B</b></button></TooltipWrap>
      <TooltipWrap tip="Italic"><button @click="toggle('italic')"    :class="['tool', active.italic    ? 'tool-active' : '']"><i>I</i></button></TooltipWrap>
      <TooltipWrap tip="Underline"><button @click="toggle('underline')" :class="['tool', active.underline ? 'tool-active' : '']"><u>U</u></button></TooltipWrap>
      <TooltipWrap tip="Strikethrough"><button @click="toggle('strike')"    :class="['tool', active.strike    ? 'tool-active' : '']"><s>S</s></button></TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Font size">
        <Dropdown :model-value="active.size" @update:model-value="v => fmtBlock('size', v)" :options="sizeOptions" />
      </TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Heading 1"><button @click="toggleBlock('header', 1)" :class="['tool font-bold text-2xs', active.header === 1 ? 'tool-active' : '']">H1</button></TooltipWrap>
      <TooltipWrap tip="Heading 2"><button @click="toggleBlock('header', 2)" :class="['tool font-bold text-2xs', active.header === 2 ? 'tool-active' : '']">H2</button></TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Bullet list">
        <button @click="toggleBlock('list', 'bullet')"  :class="['tool', active.list === 'bullet'  ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
      </TooltipWrap>
      <TooltipWrap tip="Numbered list">
        <button @click="toggleBlock('list', 'ordered')" :class="['tool', active.list === 'ordered' ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" stroke-linecap="round"/><path d="M4 10h2" stroke-linecap="round"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke-linecap="round"/></svg>
        </button>
      </TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Align left">
        <button @click="toggleBlock('align', '')"       :class="['tool', !active.align ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        </button>
      </TooltipWrap>
      <TooltipWrap tip="Align center">
        <button @click="toggleBlock('align', 'center')" :class="['tool', active.align === 'center' ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
      </TooltipWrap>
      <TooltipWrap tip="Align right">
        <button @click="toggleBlock('align', 'right')"  :class="['tool', active.align === 'right'  ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
        </button>
      </TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Inline code">
        <button @click="toggle('code')"              :class="['tool', active.code      ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
      </TooltipWrap>
      <TooltipWrap tip="Blockquote">
        <button @click="toggleBlock('blockquote', true)" :class="['tool', active.blockquote ? 'tool-active' : '']">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
        </button>
      </TooltipWrap>
      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipWrap tip="Clear formatting">
        <button @click="clearFmt()" class="tool">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444"/></svg>
        </button>
      </TooltipWrap>
    </div>
    <div ref="editorEl"></div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import Dropdown from '@/components/ui/Dropdown.vue'

const sizeOptions = [
  { value: 'small', label: 'Small' },
  { value: '',      label: 'Normal' },
  { value: 'large',  label: 'Large' },
  { value: 'huge',   label: 'Huge' },
]

const props = defineProps({
  modelValue:  { type: String, default: '' },
  placeholder: { type: String, default: 'Write something...' },
})
const emit = defineEmits(['update:modelValue'])

const editorEl = ref(null)
let quill = null

const active = reactive({
  bold: false, italic: false, underline: false, strike: false,
  code: false, header: false, list: false, align: false, blockquote: false,
  size: '',
})

function loadQuill() {
  return new Promise(resolve => {
    if (window.Quill) { resolve(); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.snow.min.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.min.js'
    script.onload = resolve
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  await loadQuill()

  const Size = window.Quill.import('attributors/style/size')
  Size.whitelist = ['small', 'large', 'huge']
  window.Quill.register(Size, true)

  quill = new window.Quill(editorEl.value, {
    theme: 'snow',
    placeholder: props.placeholder,
    modules: { toolbar: false },
  })

  if (props.modelValue) quill.root.innerHTML = props.modelValue

  quill.on('text-change', () => {
    emit('update:modelValue', quill.root.innerHTML)
    // Check if empty — force placeholder
    if (quill.getText().trim() === '') quill.root.innerHTML = ''
  })

  quill.on('selection-change', (range) => {
    if (range) updateActive() // only update when this editor gains focus
  })
})

function updateActive() {
  if (!quill) return
  const fmt = quill.getFormat()
  active.bold       = !!fmt.bold
  active.italic     = !!fmt.italic
  active.underline  = !!fmt.underline
  active.strike     = !!fmt.strike
  active.code       = !!fmt.code
  active.header     = fmt.header || false
  active.list       = fmt.list || false
  active.align      = fmt.align || false
  active.blockquote = !!fmt.blockquote
  active.size       = fmt.size || ''
}

watch(() => props.modelValue, val => {
  if (quill && quill.root.innerHTML !== val) quill.root.innerHTML = val || ''
})

onBeforeUnmount(() => { quill = null })

// Toggle inline format (bold, italic etc)
function toggle(format) {
  if (!quill) return
  const current = quill.getFormat()
  quill.format(format, !current[format])
  updateActive()
}

// Toggle block format (header, list, align etc) — click again to remove
function toggleBlock(format, value) {
  if (!quill) return
  const current = quill.getFormat()
  const isActive = current[format] === value || (format === 'align' && value === '' && !current[format])
  quill.format(format, isActive ? false : value)
  updateActive()
}

function fmtBlock(format, value) {
  if (!quill) return
  quill.format(format, value || false)
  updateActive()
}

function clearFmt() {
  if (!quill) return
  const range = quill.getSelection()
  if (range) quill.removeFormat(range.index, range.length)
  updateActive()
}
</script>

<style>
.tool {
  @apply px-2 py-1 text-xs rounded text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors;
}
.tool-active {
  @apply bg-surface-3 text-ink;
}
.ql-toolbar { display: none !important; }
.ql-container.ql-snow { border: none !important; font-family: inherit !important; font-size: 0.875rem !important; }
.ql-editor { padding: 8px 0 !important; color: #e2eaf4 !important; line-height: 1.6 !important; min-height: 80px; }
.ql-editor.ql-blank::before { color: #506680 !important; font-style: normal !important; left: 0 !important; }
.ql-editor h1 { font-size: 1.25rem; font-weight: 700; margin: 0.5rem 0; }
.ql-editor h2 { font-size: 1.1rem; font-weight: 700; margin: 0.5rem 0; }
.ql-editor ul, .ql-editor ol { padding-left: 1.5rem; }
.ql-editor li { margin: 0.15rem 0; }
.ql-editor s { text-decoration: line-through; }
.ql-editor blockquote { border-left: 3px solid #3d5470; padding-left: 1rem; color: #7a92b0; margin: 0.5rem 0; }
.ql-editor code { background: #1e2d42; padding: 0.1rem 0.3rem; border-radius: 3px; font-family: monospace; font-size: 0.85em; }
</style>
