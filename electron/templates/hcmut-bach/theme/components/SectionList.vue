<script setup lang="ts">
import { useSections } from '../utils/sections'

type TocMode = 'show' | 'shaded' | 'hide'
const props = withDefaults(defineProps<{ mode?: TocMode, highlight?: boolean }>(), { mode: 'show', highlight: false })
const { sections, current, go } = useSections()
</script>

<template>
  <div v-if="props.mode !== 'hide'" class="hb-toc" :class="{ 'is-shaded': props.mode === 'shaded' || props.highlight }">
    <button
      v-for="(section, i) in sections"
      :key="section.no"
      type="button"
      class="hb-toc-item"
      :class="{ 'is-dim': (props.mode === 'shaded' || props.highlight) && i !== current }"
      @click="go(section.startNo)"
    >
      <span class="hb-toc-num">{{ i + 1 }}</span>
      <span class="hb-toc-copy">
        <span class="hb-toc-text">{{ section.title }}</span>
        <span v-if="section.sub" class="hb-toc-sub">{{ section.sub }}</span>
      </span>
    </button>
  </div>
</template>

<style>
.hb-toc { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 12px 56px; }
.hb-toc-item { display: flex; width: 100%; align-items: center; gap: 14px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; transition: opacity 0.2s; }
.hb-toc-item.is-dim { opacity: 0.28; }
.hb-toc-num { flex: none; width: 1.5em; height: 1.5em; border-radius: 50%; background: var(--hb-dark); color: #fff; font-size: 0.72em; font-weight: 700; line-height: 1.5em; text-align: center; }
.hb-toc-copy { display: flex; flex-direction: column; gap: 2px; }
.hb-toc-text { font-size: 1.15em; line-height: 1.25; }
.hb-toc-sub { color: var(--hb-dark); font-size: 0.8em; }
</style>
