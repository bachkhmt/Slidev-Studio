import { ipcRenderer } from 'electron'

type NavMode = 'paged' | 'scroll-vertical' | 'scroll-horizontal'
type Config = {
  navMode: NavMode
  wheelAxis: 'horizontal' | 'vertical' | 'both'
  scrollSnap: boolean
  slideGapPx: number
  fitMode: 'fit-width' | 'fit-height' | 'manual'
  zoomFactor: number
  colorScheme: 'follow-app' | 'light' | 'dark' | 'slide-default'
  appThemeKind: 'light' | 'dark'
  appThemeBg?: string
  sourceJumpEnabled?: boolean
  sourceJumpTrigger?: 'alt-click' | 'ctrl-click' | 'double-click' | 'click'
}

let config: Config = {
  navMode: 'paged',
  wheelAxis: 'both',
  scrollSnap: true,
  slideGapPx: 24,
  fitMode: 'fit-width',
  zoomFactor: 1,
  colorScheme: 'follow-app',
  appThemeKind: 'dark',
  sourceJumpEnabled: true,
  sourceJumpTrigger: 'alt-click'
}
let hostVisible = true
ipcRenderer.on('studio:visibility', (_event, visible: boolean) => {
  hostVisible = visible
  if (visible) {
    applyPageMode(false)
    sendSlide(routeSlide())
  }
})
let currentSlide = 1
let lastWheelAt = 0
let wheelAccumulator = 0
let lastReportedSlide = 0
let observer: IntersectionObserver | null = null
let mutationObserver: MutationObserver | null = null
let mutationTimer: ReturnType<typeof setTimeout> | null = null
let activeScrollSlides: HTMLElement[] = []
let activeScrollContainer: HTMLElement | null = null
let lastSlideCount = -1
let lastReportedTotal = 0
let lastHover: HTMLElement | null = null
let pendingHoverEvent: PointerEvent | null = null
let hoverFrame = 0
let dragStart: { x: number; scrollLeft: number; target: HTMLElement } | null = null
let eventsAttached = false

const slideSelector = '[data-slidev-no], [data-slide-no], .slidev-page, .slidev-slide, .slide'

function routeSlide(): number {
  if (location.pathname.replace(/\/$/, '') === '/overview') {
    const overviewSlide = Number(new URLSearchParams(location.search).get('slideNo'))
    if (Number.isFinite(overviewSlide) && overviewSlide > 0) return Math.floor(overviewSlide)
  }
  const match = location.pathname.match(/\/(\d+)(?:\/|$)/)
  return match ? Math.max(1, Number(match[1])) : 1
}

function getSlideNumber(element: HTMLElement, index: number): number {
  const value =
    element.getAttribute('data-slidev-no') || element.getAttribute('data-slide-no') || element.dataset.slidevNo
  return Number(value) || index + 1
}

function slideMeta(no: number): { start?: number; filepath?: string; no?: number } | undefined {
  try {
    const app = document.querySelector('#app') as (HTMLElement & { __vue_app__?: any }) | null
    const router = app?.__vue_app__?.config?.globalProperties?.$router
    const route = router?.getRoutes?.().find((item: any) => item.meta?.slide?.no === no)
    const slide = route?.meta?.slide
    if (slide) return { start: Number(slide.start) || undefined, filepath: slide.filepath, no: slide.no }
  } catch {
    // Slidev's internal Vue router metadata is optional and version-specific.
  }
  return undefined
}

function sendSlide(no: number): void {
  const safeNo = Math.max(1, Math.floor(no || 1))
  currentSlide = safeNo
  const slides = document.querySelectorAll(slideSelector).length
  let total = slides
  try {
    const app = document.querySelector('#app') as (HTMLElement & { __vue_app__?: any }) | null
    const router = app?.__vue_app__?.config?.globalProperties?.$router
    const numbers = router
      ?.getRoutes?.()
      .map((route: any) => Number(route.meta?.slide?.no))
      .filter((value: number) => Number.isFinite(value))
    if (numbers?.length) total = Math.max(...numbers)
  } catch {
    // Use rendered DOM slide count when route metadata is not exposed.
  }
  const safeTotal = Math.max(total, safeNo)
  if (safeNo === lastReportedSlide && safeTotal === lastReportedTotal) return
  lastReportedSlide = safeNo
  lastReportedTotal = safeTotal
  ipcRenderer.sendToHost('studio:slide-changed', { no: safeNo, total: safeTotal })
}

function findSlides(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll(slideSelector)) as HTMLElement[]
  const withData = all.filter(
    (element) => element.hasAttribute('data-slidev-no') || element.hasAttribute('data-slide-no')
  )
  const candidates = withData.length
    ? withData
    : all.filter((element) => element.matches('.slidev-page, .slidev-slide, .slide'))
  return candidates.filter((element, index) => !candidates.slice(0, index).some((parent) => parent.contains(element)))
}

function findSlideItems(slides: HTMLElement[]): HTMLElement[] {
  return slides
    .map((slide) => (slide.closest('.overview-slide-block, .print-slide-container') as HTMLElement | null) || slide)
    .filter((item, index, items) => items.indexOf(item) === index)
}

function findSlideListContainer(items: HTMLElement[]): HTMLElement | null {
  const overviewScroller = document.querySelector('main') as HTMLElement | null
  if (
    location.pathname.replace(/\/$/, '') === '/overview' &&
    overviewScroller &&
    items.every((item) => overviewScroller.contains(item))
  ) {
    return overviewScroller
  }
  const printContent = document.getElementById('print-content')
  if (printContent && items.every((item) => printContent.contains(item))) return printContent
  let container = items[0]?.parentElement || null
  while (container && !items.every((item) => container!.contains(item))) container = container.parentElement
  return container
}

function rememberSlideSize(item: HTMLElement): { width: string; height: string; aspectRatio: string } {
  if (!item.dataset.studioOriginalWidth) {
    const rect = item.getBoundingClientRect()
    const appliedZoom = Math.max(0.01, Number(item.dataset.studioAppliedZoom) || 1)
    item.dataset.studioOriginalWidth = item.style.width || `${rect.width / appliedZoom}px`
    item.dataset.studioOriginalHeight = item.style.height || `${rect.height / appliedZoom}px`
    const width = Number.parseFloat(item.dataset.studioOriginalWidth)
    const height = Number.parseFloat(item.dataset.studioOriginalHeight)
    item.dataset.studioAspectRatio = width > 0 && height > 0 ? String(width / height) : '16 / 9'
  }
  return {
    width: item.dataset.studioOriginalWidth,
    height: item.dataset.studioOriginalHeight || '',
    aspectRatio: item.dataset.studioAspectRatio || '16 / 9'
  }
}

function applySlideZoom(item: HTMLElement, fitToViewport: boolean): void {
  const previousZoom = Math.max(0.01, Number(item.dataset.studioAppliedZoom) || 1)
  const rect = item.getBoundingClientRect()
  const baseWidth = rect.width / previousZoom
  const baseHeight = rect.height / previousZoom
  let fitScale = 1
  if (fitToViewport && config.fitMode === 'fit-width' && baseWidth > 0) {
    fitScale = Math.max(0.1, (document.documentElement.clientWidth - 24) / baseWidth)
  } else if (fitToViewport && config.fitMode === 'fit-height' && baseHeight > 0) {
    fitScale = Math.max(0.1, (document.documentElement.clientHeight - 24) / baseHeight)
  }
  const zoom = Math.min(4, Math.max(0.2, fitScale * (Number(config.zoomFactor) || 1)))
  item.style.zoom = String(zoom)
  item.dataset.studioAppliedZoom = String(zoom)
}

function applyPageMode(scrollToCurrent = false): void {
  if (!document.documentElement || !document.body) return
  const isOverview = location.pathname.replace(/\/$/, '') === '/overview'
  const previewBg =
    config.colorScheme === 'follow-app'
      ? config.appThemeBg || (config.appThemeKind === 'dark' ? '#020617' : '#ffffff')
      : config.colorScheme === 'dark'
        ? '#020617'
        : config.colorScheme === 'light'
          ? '#ffffff'
          : 'transparent'
  if (!document.querySelector('style[data-studio-scroll-style]')) {
    const style = document.createElement('style')
    style.dataset.studioScrollStyle = 'true'
    style.textContent =
      '@media screen{.slidev-page,.slidev-slide{break-after:auto!important;page-break-after:auto!important;break-inside:avoid!important;page-break-inside:avoid!important}}#app .overview-slide-block>.select-none.text-right,#app .overview-slide-action{display:none!important}'
    document.head?.appendChild(style)
  }
  document.body.style.backgroundColor = previewBg
  document.documentElement.style.colorScheme =
    config.colorScheme === 'follow-app'
      ? config.appThemeKind
      : config.colorScheme === 'slide-default'
        ? ''
        : config.colorScheme
  document.documentElement.dataset.studioColorScheme =
    config.colorScheme === 'follow-app' ? config.appThemeKind : config.colorScheme
  document.documentElement.classList.toggle(
    'dark',
    config.colorScheme === 'dark' || (config.colorScheme === 'follow-app' && config.appThemeKind === 'dark')
  )

  const slides = findSlides()
  lastSlideCount = slides.length
  if (observer) observer.disconnect()

  if (config.navMode === 'paged') {
    activeScrollContainer = null
    activeScrollSlides = []
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.height = ''
    document.body.style.height = ''
    document.documentElement.style.scrollSnapType = ''
    document.body.style.scrollSnapType = ''
    slides.forEach((slide) => {
      slide.style.scrollSnapAlign = ''
    })
    findSlideItems(slides).forEach((item) => applySlideZoom(item, true))
    return
  }

  if (!slides.length) return
  const items = findSlideItems(slides)
  const container = findSlideListContainer(items)
  if (!container) return
  const horizontal = config.navMode === 'scroll-horizontal'
  activeScrollSlides = items
  activeScrollContainer = container
  document.documentElement.style.height = '100%'
  document.body.style.height = '100%'
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  document.documentElement.style.scrollSnapType = ''
  document.body.style.scrollSnapType = ''
  // Keep a small edge inset, independent from the configurable gap between slides.
  // Using half of slideGapPx here made large inter-slide gaps shrink every slide.
  const padding = 4
  container.style.display = horizontal ? 'flex' : 'block'
  container.style.flexDirection = horizontal ? 'row' : ''
  container.style.flexWrap = 'nowrap'
  container.style.alignItems = horizontal ? 'center' : ''
  container.style.gap = `${Math.max(0, config.slideGapPx)}px`
  container.style.width = '100%'
  container.style.height = isOverview ? '100%' : 'calc(100vh - 1rem)'
  container.style.maxHeight = isOverview ? '100%' : 'calc(100vh - 1rem)'
  container.style.minHeight = '0'
  container.style.flex = '1 1 auto'
  container.style.boxSizing = 'border-box'
  container.style.overflowX = horizontal ? 'auto' : 'hidden'
  container.style.overflowY = horizontal ? 'hidden' : 'auto'
  container.style.scrollSnapType = config.scrollSnap ? `${horizontal ? 'x' : 'y'} mandatory` : ''
  container.style.padding = `${padding}px`
  container.style.backgroundColor = previewBg
  container.style.scrollBehavior = 'smooth'

  if (isOverview) {
    const slideRect = slides[0]?.getBoundingClientRect()
    const aspectRatio = slideRect && slideRect.height > 0 ? slideRect.width / slideRect.height : 16 / 9
    const availableWidth = Math.max(240, window.innerWidth - padding * 2)
    const availableHeight = Math.max(180, window.innerHeight - padding * 2)
    items.forEach((item) => {
      item.style.boxSizing = 'border-box'
      item.style.display = 'flex'
      item.style.flex = horizontal ? '0 0 100%' : 'none'
      item.style.width = '100%'
      item.style.height = horizontal ? '100%' : 'auto'
      item.style.minHeight = horizontal ? '100%' : '0'
      item.style.scrollSnapAlign = config.scrollSnap ? 'start' : ''
      item.style.margin = '0'
      item.style.borderTop = '0'
      item.style.justifyContent = 'center'
      item.style.alignItems = 'center'
      const indexRail = item.querySelector(':scope > .select-none.text-right') as HTMLElement | null
      if (indexRail) indexRail.style.display = 'none'
      const card = item.querySelector(':scope > .flex.flex-col') as HTMLElement | null
      if (card) {
        if (!card.dataset.studioOriginalWidth)
          card.dataset.studioOriginalWidth = card.style.width || `${card.getBoundingClientRect().width}px`
        const originalWidth = Number.parseFloat(card.dataset.studioOriginalWidth)
        const width =
          config.fitMode === 'fit-height'
            ? Math.min(availableWidth, availableHeight * aspectRatio, 1280)
            : config.fitMode === 'manual'
              ? Math.min(availableWidth, originalWidth || 450)
              : Math.min(availableWidth, 1280)
        card.style.width = `${Math.max(240, width)}px`
        card.style.maxWidth = '100%'
        card.style.margin = '0'
      }
      applySlideZoom(item, false)
    })
    const root = document.querySelector('#app > div') as HTMLElement | null
    const nav = root?.querySelector(':scope > nav') as HTMLElement | null
    const summary = root?.querySelector(':scope > div.absolute') as HTMLElement | null
    const main = root?.querySelector(':scope > main') as HTMLElement | null
    if (nav) nav.style.display = 'none'
    if (summary) summary.style.display = 'none'
    if (main) {
      main.style.boxSizing = 'border-box'
      main.style.width = '100%'
      main.style.height = '100%'
      main.style.minHeight = '0'
      main.style.flex = '1 1 auto'
      main.style.display = horizontal ? 'flex' : 'block'
      main.style.flexDirection = horizontal ? 'row' : ''
      main.style.flexWrap = 'nowrap'
      main.style.alignItems = horizontal ? 'center' : ''
    }
  } else
    items.forEach((item) => {
      const original = rememberSlideSize(item)
      item.style.boxSizing = 'border-box'
      item.style.flex = horizontal ? '0 0 auto' : ''
      item.style.scrollSnapAlign = config.scrollSnap ? 'start' : ''
      item.style.margin = horizontal ? '0' : '0 auto'
      if (config.fitMode === 'fit-width') {
        item.style.width = 'min(100%, 1280px)'
        item.style.height = 'auto'
        item.style.aspectRatio = original.aspectRatio
        item.style.maxWidth = '100%'
      } else if (config.fitMode === 'fit-height') {
        item.style.height = 'calc(100vh - 2rem)'
        item.style.width = 'auto'
        item.style.aspectRatio = original.aspectRatio
        item.style.maxWidth = '100%'
      } else {
        item.style.width = original.width
        item.style.height = original.height
        item.style.aspectRatio = ''
        item.style.maxWidth = ''
      }
      applySlideZoom(item, false)
    })

  observer = new IntersectionObserver(
    (entries) => {
      const best = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!best) return
      const element = best.target as HTMLElement
      sendSlide(getSlideNumber(element, items.indexOf(element)))
    },
    { root: container, threshold: [0.2, 0.45, 0.65, 0.85] }
  )
  items.forEach((item) => observer?.observe(item))

  if (scrollToCurrent && (config.navMode === 'scroll-vertical' || config.navMode === 'scroll-horizontal')) {
    const currentIndex = slides.findIndex((slide, index) => getSlideNumber(slide, index) === currentSlide)
    const currentItem = currentIndex >= 0 ? items[currentIndex] : undefined
    currentItem?.scrollIntoView({ block: 'start', inline: 'start' })
  }
}

function gotoSlide(no: number): void {
  currentSlide = Math.max(1, Number(no) || 1)
  if (config.navMode === 'paged') {
    if (routeSlide() !== currentSlide) {
      try {
        const root = document.querySelector('#app') as (HTMLElement & { __vue_app__?: any }) | null
        const router = root?.__vue_app__?.config?.globalProperties?.$router
        if (router?.push)
          void router
            .push(`/${currentSlide}`)
            .then(() => sendSlide(currentSlide))
            .catch(() => {
              location.href = `${location.origin}/${currentSlide}`
            })
        else location.href = `${location.origin}/${currentSlide}`
      } catch {
        location.href = `${location.origin}/${currentSlide}`
      }
    } else sendSlide(currentSlide)
    return
  }
  const slides = findSlides()
  const items = findSlideItems(slides)
  const index = slides.findIndex((slide, itemIndex) => getSlideNumber(slide, itemIndex) === currentSlide)
  const element = index >= 0 ? items[index] : undefined
  element?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
  sendSlide(currentSlide)
}

function triggerPagedNavigation(direction: number): void {
  ipcRenderer.sendToHost('studio:wheel-nav', { direction })
}

function handleWheel(event: WheelEvent): void {
  if (!config || event.ctrlKey || event.metaKey) return
  if (config.navMode === 'paged') {
    let scrollable = (event.target as HTMLElement | null)?.closest?.('*') as HTMLElement | null
    while (scrollable && scrollable !== document.body) {
      const style = getComputedStyle(scrollable)
      const canScrollY =
        scrollable.scrollHeight > scrollable.clientHeight && ['auto', 'scroll'].includes(style.overflowY)
      const canScrollX = scrollable.scrollWidth > scrollable.clientWidth && ['auto', 'scroll'].includes(style.overflowX)
      if (
        (Math.abs(event.deltaY) > Math.abs(event.deltaX) && canScrollY) ||
        (Math.abs(event.deltaX) >= Math.abs(event.deltaY) && canScrollX)
      )
        return
      scrollable = scrollable.parentElement
    }
  }
  const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 'horizontal' : 'vertical'
  if (config.navMode === 'paged') {
    if (config.wheelAxis !== 'both' && config.wheelAxis !== axis) return
    const delta = axis === 'horizontal' ? event.deltaX : event.deltaY
    if (Math.abs(delta) < 8) return
    event.preventDefault()
    wheelAccumulator += delta
    const now = Date.now()
    if (now - lastWheelAt < 350 || Math.abs(wheelAccumulator) < 75) return
    const direction = wheelAccumulator > 0 ? 1 : -1
    wheelAccumulator = 0
    lastWheelAt = now
    triggerPagedNavigation(direction)
    return
  }
  if (config.navMode === 'scroll-horizontal' && activeScrollContainer) {
    const delta = event.deltaX || event.deltaY
    if (delta) {
      activeScrollContainer.scrollLeft += delta
      event.preventDefault()
    }
  }
}

function clickPayload(event: MouseEvent): void {
  if (
    config.sourceJumpTrigger === 'click' &&
    (event.target as HTMLElement | null)?.closest?.(
      'a, button, input, textarea, select, summary, [role="button"], [data-v-click], video'
    )
  )
    return
  const slide = (event.target as HTMLElement | null)?.closest(slideSelector) as HTMLElement | null
  if (!slide) return
  const selection = window.getSelection()?.toString().trim()
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
  const node = range?.startContainer
  const text = node?.nodeType === Node.TEXT_NODE ? node.textContent || '' : ''
  const offset = range?.startOffset ?? 0
  const clickedText =
    selection ||
    text
      .slice(
        Math.max(0, text.slice(0, offset).search(/[\p{L}\p{N}_-]*$/u)),
        offset + (text.slice(offset).match(/^[\p{L}\p{N}_-]*/u)?.[0].length || 0)
      )
      .trim()
  const element = (node?.parentElement || (event.target as HTMLElement)).closest(
    'p,li,h1,h2,h3,h4,h5,h6,td,blockquote,pre'
  ) as HTMLElement | null
  const block = element || (event.target as HTMLElement)
  const pre = block.closest('pre') as HTMLElement | null
  let kind: 'text' | 'heading' | 'list' | 'code' | 'image' | 'table' | 'component' = 'text'
  if (pre) kind = 'code'
  else if (/^H[1-6]$/.test(block.tagName)) kind = 'heading'
  else if (block.closest('li')) kind = 'list'
  else if (block.closest('td,th')) kind = 'table'
  else if (block.closest('img,svg,video,canvas')) kind = 'image'
  const slides = findSlides()
  const hasSlideNumber = slide.hasAttribute('data-slidev-no') || slide.hasAttribute('data-slide-no')
  const slideNo =
    hasSlideNumber || config.navMode !== 'paged'
      ? getSlideNumber(slide, Math.max(0, slides.indexOf(slide))) || routeSlide()
      : routeSlide()
  const normalized = clickedText.toLocaleLowerCase()
  let beforeCount = 0
  if (normalized && node?.nodeType === Node.TEXT_NODE) {
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT)
    let current: Node | null
    while ((current = walker.nextNode())) {
      if (current === node) break
      const hay = (current.textContent || '').toLocaleLowerCase()
      let cursor = 0
      while ((cursor = hay.indexOf(normalized, cursor)) !== -1) {
        beforeCount++
        cursor += normalized.length
      }
    }
    const hay = text.toLocaleLowerCase()
    let cursor = 0
    while ((cursor = hay.indexOf(normalized, cursor)) !== -1 && cursor < offset) {
      beforeCount++
      cursor += normalized.length
    }
  }
  const allPres = Array.from(slide.querySelectorAll('pre')) as HTMLElement[]
  const codeBlockIndex = pre ? allPres.indexOf(pre) : undefined
  const codeLine =
    pre && node
      ? Math.max(
          0,
          Array.from(pre.querySelectorAll('.line')).findIndex((line) => line.contains(node))
        )
      : undefined
  const meta = slideMeta(slideNo)
  const payload = {
    slideNo,
    clickedText: clickedText.slice(0, 100),
    context: (block.innerText || block.textContent || '').slice(0, 200),
    occurrenceIndex: beforeCount,
    kind: clickedText ? kind : 'component',
    codeLine: codeLine !== undefined && codeLine >= 0 ? codeLine : undefined,
    codeBlockIndex,
    slideMeta: meta,
    path: [block.tagName.toLowerCase(), ...Array.from(block.classList).slice(0, 3)].join('.')
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  ipcRenderer.sendToHost('studio:source-click', payload)
}

function attach(scrollToCurrent = false): void {
  if (!document.documentElement) return
  if (!eventsAttached) {
    let resizeFrame = 0
    window.addEventListener(
      'resize',
      () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0
          applyPageMode(false)
        })
      },
      { passive: true }
    )
    document.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    document.addEventListener(
      'click',
      (event) => {
        const mouse = event as MouseEvent
        if (config.sourceJumpEnabled === false) return
        if (config.sourceJumpTrigger === 'alt-click' && !mouse.altKey) return
        if (config.sourceJumpTrigger === 'ctrl-click' && !mouse.ctrlKey) return
        if (config.sourceJumpTrigger === 'double-click') return
        clickPayload(mouse)
      },
      true
    )
    document.addEventListener(
      'dblclick',
      (event) => {
        if (config.sourceJumpTrigger === 'double-click') clickPayload(event as MouseEvent)
      },
      true
    )
    document.addEventListener(
      'pointermove',
      (event) => {
        if (!hostVisible || config.sourceJumpEnabled === false) return
        pendingHoverEvent = event as PointerEvent
        if (hoverFrame) return
        hoverFrame = requestAnimationFrame(() => {
          hoverFrame = 0
          const mouse = pendingHoverEvent
          if (!mouse) return
          const active =
            config.sourceJumpTrigger === 'alt-click'
              ? mouse.altKey
              : config.sourceJumpTrigger === 'ctrl-click'
                ? mouse.ctrlKey
                : config.sourceJumpTrigger === 'click' || config.sourceJumpTrigger === 'double-click'
          const target = active
            ? ((mouse.target as HTMLElement | null)?.closest(
                'p,li,h1,h2,h3,h4,h5,h6,td,blockquote'
              ) as HTMLElement | null)
            : null
          if (target === lastHover) return
          lastHover?.removeAttribute('data-studio-jump-hover')
          lastHover = target
          lastHover?.setAttribute('data-studio-jump-hover', 'true')
        })
      },
      true
    )
    if (!document.querySelector('style[data-studio-jump-style]')) {
      const hoverStyle = document.createElement('style')
      hoverStyle.dataset.studioJumpStyle = 'true'
      hoverStyle.textContent =
        '[data-studio-jump-hover="true"]{outline:2px solid rgba(59,130,246,.85)!important;outline-offset:2px!important;cursor:crosshair!important}'
      document.head?.appendChild(hoverStyle)
    }
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (config.navMode !== 'scroll-horizontal' || event.button !== 0) return
        const target = activeScrollContainer
        if (!target || (event.target as HTMLElement).closest('a,button,input,textarea,select')) return
        dragStart = { x: event.clientX, scrollLeft: target.scrollLeft, target }
        target.style.cursor = 'grabbing'
      },
      true
    )
    document.addEventListener(
      'pointermove',
      (event) => {
        if (!dragStart) return
        dragStart.target.scrollLeft = dragStart.scrollLeft - (event.clientX - dragStart.x)
      },
      true
    )
    document.addEventListener(
      'pointerup',
      () => {
        if (dragStart) dragStart.target.style.cursor = ''
        dragStart = null
      },
      true
    )
    eventsAttached = true
  }
  mutationObserver?.disconnect()
  mutationObserver = new MutationObserver(() => {
    if (!hostVisible || config.navMode === 'paged' || mutationTimer) return
    mutationTimer = setTimeout(() => {
      mutationTimer = null
      if (config.navMode !== 'paged' && findSlides().length !== lastSlideCount) {
        applyPageMode(false)
        sendSlide(currentSlide)
      }
    }, 150)
  })
  mutationObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
  applyPageMode(scrollToCurrent)
  if (config.navMode !== 'paged' && location.pathname.replace(/\/$/, '') === '/print') {
    window.setTimeout(() => {
      if (!findSlides().length && location.pathname.replace(/\/$/, '') === '/print') {
        // Fallback for Slidev versions whose /print page lacks identifiable slide nodes.
        location.replace('/overview')
      }
    }, 1500)
  }
  if (!lastReportedSlide) sendSlide(routeSlide())
  else sendSlide(currentSlide)
}

ipcRenderer.on('studio:set-mode', (_event, value: Partial<Config>) => {
  if (Object.entries(value).every(([key, entry]) => (config as any)[key] === entry)) return
  const modeChanged = value.navMode !== undefined && value.navMode !== config.navMode
  config = { ...config, ...value }
  attach(modeChanged)
})
ipcRenderer.on('studio:goto', (_event, value: { no: number }) => gotoSlide(value.no))
ipcRenderer.on('studio:set-jump', (_event, value: { enabled: boolean; trigger: Config['sourceJumpTrigger'] }) => {
  config = { ...config, sourceJumpEnabled: value.enabled, sourceJumpTrigger: value.trigger }
})

window.addEventListener('DOMContentLoaded', () => {
  currentSlide = routeSlide()
  attach(true)
  ipcRenderer.sendToHost('studio:ready', { no: currentSlide })
})
window.addEventListener('popstate', () => setTimeout(() => sendSlide(routeSlide()), 50))
setInterval(() => {
  if (hostVisible && !document.hidden && config.navMode === 'paged') sendSlide(routeSlide())
}, 2000)
