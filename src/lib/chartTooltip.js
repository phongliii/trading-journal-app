// Shared "external" tooltip handler for Chart.js.
// Renders a real DOM element (instead of Chart.js's canvas-drawn tooltip)
// so it can be positioned with proper edge-avoidance, matching the rest
// of the app's tooltip behavior, and never clips or overlaps other bars.
//
// Usage:
//   const { handler, cleanup } = createExternalTooltip()
//   ...tooltip: { enabled: false, external: handler }
//   onBeforeUnmount(cleanup)

// Every live tooltip, so hideChartTooltips() can reach them all.
const live = new Set()

// Hide every chart tooltip and clear the charts' hover state. For a popup
// that opens by itself (e.g. "Target reached") while the cursor rests on a
// chart: the tooltip would otherwise stay drawn on top of it, and the chart
// would keep its hover until the mouse left the canvas.
export function hideChartTooltips() {
  for (const t of live) t.hide()
}

export function createExternalTooltip() {
  let tooltipEl = null
  let lastChart = null

  const entry = {
    hide() {
      if (tooltipEl) tooltipEl.style.opacity = '0'
      const chart = lastChart
      if (!chart?.canvas) return
      chart.setActiveElements([])
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 })
      chart.update('none')
    },
  }
  live.add(entry)

  function getOrCreateTooltip() {
    if (tooltipEl) return tooltipEl
    tooltipEl = document.createElement('div')
    tooltipEl.style.position = 'fixed'
    tooltipEl.style.zIndex = '9999'
    tooltipEl.style.pointerEvents = 'none'
    tooltipEl.style.background = '#161f2e'
    tooltipEl.style.border = '1px solid #1e2d42'
    tooltipEl.style.borderRadius = '6px'
    tooltipEl.style.padding = '8px 10px'
    tooltipEl.style.fontSize = '12px'
    tooltipEl.style.color = '#e2eaf4'
    tooltipEl.style.transition = 'opacity 0.1s ease'
    tooltipEl.style.whiteSpace = 'nowrap'
    tooltipEl.style.opacity = '0'
    document.body.appendChild(tooltipEl)
    return tooltipEl
  }

  function handler(context) {
    const { chart, tooltip } = context
    lastChart = chart
    const el = getOrCreateTooltip()

    if (tooltip.opacity === 0) {
      el.style.opacity = '0'
      return
    }

    // Build content
    const titleLines = tooltip.title || []
    const bodyLines = tooltip.body ? tooltip.body.map(b => b.lines).flat() : []
    let html = ''
    if (titleLines.length) {
      html += `<div style="color:#7a92b0;margin-bottom:4px;">${titleLines.join(' ')}</div>`
    }
    for (const line of bodyLines) {
      html += `<div style="font-weight:600;">${line}</div>`
    }
    el.innerHTML = html

    // Position using the chart canvas's actual screen location + edge avoidance
    const canvasRect = chart.canvas.getBoundingClientRect()
    const tipW = el.offsetWidth
    const tipH = el.offsetHeight
    const margin = 8

    // Chart.js gives tooltip.caretX/caretY relative to the canvas
    const pointX = canvasRect.left + tooltip.caretX
    const pointY = canvasRect.top + tooltip.caretY

    // Vertical: prefer above the point, flip below if not enough room
    const showAbove = pointY > tipH + margin
    const top = showAbove ? pointY - tipH - margin : pointY + margin

    // Horizontal: center on the point, clamp to viewport
    let left = pointX - tipW / 2
    const minLeft = margin
    const maxLeft = window.innerWidth - tipW - margin
    if (left < minLeft) left = minLeft
    if (left > maxLeft) left = maxLeft

    el.style.opacity = '1'
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }

  function cleanup() {
    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl)
    }
    tooltipEl = null
    lastChart = null
    live.delete(entry)
  }

  return { handler, cleanup }
}
