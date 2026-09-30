<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { configs, useNav, useSlideContext } from '@slidev/client'
import { useSections } from '../utils/sections'

type ContentSize = 'xs' | 'sm' | 'md' | number

const props = withDefaults(defineProps<{
  /** class riêng của layout (hb-default, hb-cover...) */
  cls?: string
  /** hiện thanh điều hướng section phía trên */
  headline?: boolean
  /** slide có thanh tiêu đề (h1) ngay dưới headline */
  titled?: boolean
  /** hiện footer Beamer */
  footer?: boolean
  /** cỡ nội dung: xs / sm / md hoặc px */
  size?: ContentSize
  /** tắt ảnh nền cho deck hoặc slide cần in nền trắng */
  background?: boolean
}>(), { cls: '', headline: true, titled: true, footer: true, background: undefined })

const cfg = configs as Record<string, any>
const { total } = useNav()
const { $page } = useSlideContext()
const { sections, current, go } = useSections()
const frameRef = ref<HTMLElement | null>(null)
const overflowPx = ref(0)
const isPrint = ref(false)
let sizeObserver: ResizeObserver | undefined
let contentObserver: MutationObserver | undefined
let documentObserver: MutationObserver | undefined
let measureFrame = 0

const author = computed(() => {
  if (Array.isArray(cfg.authors) && cfg.authors.length) {
    return cfg.authors.map((person: unknown) => {
      if (typeof person === 'string') return person
      if (person && typeof person === 'object') {
        const value = person as Record<string, unknown>
        return String(value.name ?? value.author ?? '')
      }
      return String(person ?? '')
    }).filter(Boolean).join(' · ')
  }
  return String(cfg.author ?? '')
})
const institute = computed(() => String(cfg.institute ?? ''))
const shortTitle = computed(() => String(cfg.shortTitle ?? cfg.title ?? ''))
const advisor = computed(() => String(cfg.advisor ?? ''))
const hasBackground = computed(() => props.background ?? cfg.background !== false)
const pageNumber = computed(() => Number($page.value ?? 1))
const contentSize = computed(() => {
  const value = props.size ?? cfg.size ?? 'md'
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(8, value)}px`
  if (typeof value === 'string' && /^\d+(?:\.\d+)?px$/.test(value)) return value
  return ({ xs: '14px', sm: '17px', md: '21px' } as Record<string, string>)[String(value)] ?? '21px'
})
const frameStyle = computed(() => ({ '--hb-content-size': contentSize.value }) as Record<string, string>)
const hasOverflow = computed(() => import.meta.env.DEV && !isPrint.value && overflowPx.value > 0)

function measureOverflow(): void {
  if (!import.meta.env.DEV) return
  cancelAnimationFrame(measureFrame)
  measureFrame = requestAnimationFrame(() => {
    const main = frameRef.value?.querySelector<HTMLElement>('.hb-main')
    if (!main) {
      overflowPx.value = 0
      return
    }
    overflowPx.value = Math.max(0, Math.ceil(main.scrollHeight - main.clientHeight))
  })
}

function updatePrintMode(): void {
  isPrint.value = document.documentElement.classList.contains('print')
  measureOverflow()
}

function observeContentElements(root: HTMLElement): void {
  if (!sizeObserver) return
  root.querySelectorAll<HTMLElement>('*').forEach((element) => sizeObserver?.observe(element))
}

watch(() => pageNumber.value, () => {
  void nextTick(measureOverflow)
}, { flush: 'post' })

onMounted(() => {
  void nextTick(measureOverflow)
  const main = frameRef.value?.querySelector<HTMLElement>('.hb-main')
  if (main && typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(measureOverflow)
    sizeObserver.observe(main)
    observeContentElements(main)
  }
  if (main && typeof MutationObserver !== 'undefined') {
    contentObserver = new MutationObserver(() => {
      observeContentElements(main)
      measureOverflow()
    })
    contentObserver.observe(main, { childList: true, characterData: true, subtree: true })
  }
  if (typeof MutationObserver !== 'undefined') {
    documentObserver = new MutationObserver(updatePrintMode)
    documentObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }
  updatePrintMode()
  if (document.fonts?.ready) void document.fonts.ready.then(measureOverflow)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(measureFrame)
  sizeObserver?.disconnect()
  contentObserver?.disconnect()
  documentObserver?.disconnect()
})
</script>

<template>
  <div
    ref="frameRef"
    class="slidev-layout hb"
    :class="[cls, { 'has-background': hasBackground, 'has-overflow': hasOverflow, 'no-footer': !footer }]"
    :style="frameStyle"
    :data-hb-page="pageNumber"
    :data-hb-overflow-px="overflowPx"
  >
    <div v-if="hasBackground" class="hb-bg" aria-hidden="true" />

    <header v-if="headline" class="hb-head">
      <nav class="hb-nav" aria-label="Điều hướng section">
        <div
          v-for="(section, sectionIndex) in sections"
          :key="section.no"
          class="hb-nav-group"
          :class="{
            'is-current': sectionIndex === current,
            'is-dim': current >= 0 && sectionIndex !== current
          }"
        >
          <button
            type="button"
            class="hb-nav-item"
            :title="section.title"
            @click="go(section.startNo)"
          >{{ section.short }}</button>
          <div class="hb-mini-frames" :aria-label="`${section.slideNumbers.length} slide trong ${section.title}`">
            <button
              v-for="slideNo in section.slideNumbers"
              :key="slideNo"
              type="button"
              class="hb-mini-frame"
              :class="{ 'is-active': slideNo === pageNumber }"
              :aria-label="`Đi tới slide ${slideNo}`"
              :title="`Slide ${slideNo}`"
              @click="go(slideNo)"
            />
          </div>
        </div>
      </nav>
      <div class="hb-fade" :class="{ 'is-untitled': !titled }" />
    </header>

    <main class="hb-main">
      <slot />
    </main>

    <footer v-if="footer" class="hb-foot">
      <div class="hb-foot-row hb-foot-meta">
        <span class="hb-ellipsis">{{ author }}</span>
        <span class="hb-ellipsis hb-right">{{ institute }}</span>
      </div>
      <div class="hb-foot-row hb-foot-title">
        <span class="hb-ellipsis">{{ shortTitle }}</span>
        <span class="hb-num">{{ pageNumber }} / {{ total }}</span>
      </div>
    </footer>

    <div v-if="hasOverflow" class="hb-overflow-warning" role="status">
      Tràn {{ overflowPx }}px
    </div>
  </div>
</template>

<style>
.slidev-layout.hb {
  --hb-nav-height: 34px;
  --hb-foot-height: 38px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #fff;
  color: var(--hb-ink);
  font-size: var(--hb-content-size, 21px);
  line-height: 1.45;
}
.slidev-layout.hb.no-footer { --hb-foot-height: 0px; }

.hb-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('../assets/bk_bg.webp') center / cover no-repeat;
  opacity: 0.5;
  pointer-events: none;
}

.hb-head, .hb-main, .hb-foot { position: relative; z-index: 1; }
.hb-head { flex: none; }
.hb-nav {
  display: flex;
  justify-content: space-around;
  align-items: stretch;
  gap: 8px;
  min-height: var(--hb-nav-height);
  padding: 3px 12px 2px;
  background: var(--hb-dark);
  color: #fff;
  font-size: 11px;
}
.hb-nav-group {
  flex: 1 1 0;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.hb-nav-group.is-dim { opacity: 0.55; }
.hb-nav-item {
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.hb-nav-group.is-current .hb-nav-item { font-weight: 700; }
.hb-mini-frames { display: flex; min-height: 5px; align-items: center; justify-content: center; gap: 2px; }
.hb-mini-frame {
  flex: none;
  width: 4px;
  height: 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.52);
  cursor: pointer;
}
.hb-mini-frame.is-active { width: 6px; height: 6px; background: #fff; }
.hb-fade { height: 8px; background: linear-gradient(var(--hb-dark), var(--hb-light)); }
.hb-fade.is-untitled { background: linear-gradient(var(--hb-dark), rgba(3, 43, 145, 0)); }

.hb-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.hb-foot { flex: none; min-height: var(--hb-foot-height); color: #fff; font-size: 12px; }
.hb-foot-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  height: 19px;
  padding: 0 14px;
}
.hb-foot-meta { background: var(--hb-light); }
.hb-foot-title { border-top: 1px solid rgba(255, 255, 255, 0.45); background: var(--hb-dark); }
.hb-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hb-right { flex: none; text-align: right; }
.hb-num { flex: none; font-variant-numeric: tabular-nums; }

.hb.has-overflow .hb-main { outline: 2px solid #dc2626; outline-offset: -2px; }
.hb-overflow-warning {
  position: absolute;
  right: 8px;
  bottom: calc(var(--hb-foot-height) + 5px);
  z-index: 5;
  padding: 3px 8px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif;
}

html.print .hb.has-overflow .hb-main { outline: 0; }
html.print .hb-overflow-warning { display: none !important; }
@media print {
  .hb-overflow-warning { display: none !important; }
}
</style>
