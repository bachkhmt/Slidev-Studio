<!--
  Hai cột dưới thanh tiêu đề.
  ---
  layout: two-cols
  ---
  # Tiêu đề
  ::left::
  nội dung trái
  ::right::
  nội dung phải
-->
<script setup lang="ts">
import { computed } from 'vue'
import HbFrame from '../components/HbFrame.vue'

const props = withDefaults(defineProps<{
  subtitle?: string
  align?: 'top' | 'center'
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
  ratio?: '1:1' | '1:2' | '2:1'
}>(), { ratio: '1:1', background: undefined })

const columnRatio = computed(() => props.ratio === '1:2' ? '1fr 2fr' : props.ratio === '2:1' ? '2fr 1fr' : '1fr 1fr')
</script>

<template>
  <HbFrame cls="hb-two-cols" :size="props.size" :background="props.background">
    <div class="hb-content" :class="[props.subtitle ? 'has-sub' : '', props.align === 'center' ? 'is-center' : 'is-top']">
      <slot />
      <div class="hb-cols" :style="{ '--hb-cols': columnRatio }">
        <div class="hb-col"><slot name="left" /></div>
        <div class="hb-col"><slot name="right" /></div>
      </div>
      <div v-if="props.subtitle" class="hb-subtitle">{{ props.subtitle }}</div>
    </div>
  </HbFrame>
</template>

<style>
.hb-cols { display: grid; grid-template-columns: var(--hb-cols, 1fr 1fr); gap: 28px; }
.hb-col > :first-child { margin-top: 0; }
</style>
