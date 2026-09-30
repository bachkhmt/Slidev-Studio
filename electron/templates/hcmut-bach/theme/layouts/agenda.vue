<!--
  Mục lục đầu bài (\tableofcontents), không làm mờ section nào.
  ---
  layout: agenda
  ---
-->
<script setup lang="ts">
import HbFrame from '../components/HbFrame.vue'
import SectionList from '../components/SectionList.vue'

const props = withDefaults(defineProps<{
  toc?: 'show' | 'shaded' | 'hide'
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
}>(), { toc: 'show', background: undefined })
</script>

<template>
  <HbFrame cls="hb-agenda" :titled="false" :size="props.size" :background="props.background">
    <SectionList :mode="props.toc" />
  </HbFrame>
</template>
