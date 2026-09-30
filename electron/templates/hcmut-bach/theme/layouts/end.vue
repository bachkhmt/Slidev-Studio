<script setup lang="ts">
import HbFrame from '../components/HbFrame.vue'

const props = withDefaults(defineProps<{
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
}>(), { size: 'md', background: undefined })
</script>

<template>
  <HbFrame cls="hb-end" :size="props.size" :background="props.background">
    <div class="hb-content is-center hb-end-content"><slot /></div>
  </HbFrame>
</template>

<style>
.hb-end .hb-end-content { justify-content: center; align-items: center; text-align: center; }
.hb-end .hb-end-content > h1 { width: 100%; }
</style>
