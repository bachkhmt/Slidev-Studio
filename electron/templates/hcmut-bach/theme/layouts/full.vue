<script setup lang="ts">
import HbFrame from '../components/HbFrame.vue'

const props = withDefaults(defineProps<{
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
}>(), { background: false })
</script>

<template>
  <HbFrame cls="hb-full" :headline="false" :titled="false" :footer="false" :size="props.size" :background="props.background">
    <div class="hb-full-content"><slot /></div>
  </HbFrame>
</template>

<style>
.hb-full .hb-main { overflow: hidden; }
.hb-full-content { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
.hb-full-content > img, .hb-full-content figure, .hb-full-content video { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
