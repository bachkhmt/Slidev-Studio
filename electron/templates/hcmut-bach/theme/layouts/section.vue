<!--
  Slide mở đầu mỗi section (\AtBeginSection + \tableofcontents[sectionstyle=show/shaded]).
  Tên section lấy từ `title`; `short` là tên rút gọn cho thanh điều hướng.
  ---
  layout: section
  title: Kết luận
  short: Kết luận
  ---
-->
<script setup lang="ts">
import HbFrame from '../components/HbFrame.vue'
import SectionList from '../components/SectionList.vue'

const props = withDefaults(defineProps<{
  toc?: 'show' | 'shaded' | 'hide'
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
}>(), { toc: 'shaded', background: undefined })
</script>

<template>
  <HbFrame cls="hb-section" :titled="false" :size="props.size" :background="props.background">
    <SectionList :mode="props.toc" highlight />
  </HbFrame>
</template>
