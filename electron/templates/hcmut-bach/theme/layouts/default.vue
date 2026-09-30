<!--
  Frame thường: `# Tiêu đề` = \frametitle.
  Tùy chọn frontmatter:
    subtitle: "1/7: Intensity normalization"   # = \framesubtitle
    align: top                                   # = \begin{frame}[t]  (mặc định: căn giữa dọc như Beamer)
-->
<script setup lang="ts">
import HbFrame from '../components/HbFrame.vue'

const props = withDefaults(defineProps<{
  subtitle?: string
  align?: 'top' | 'center'
  size?: 'xs' | 'sm' | 'md' | number
  background?: boolean
}>(), { align: 'center', background: undefined })
</script>

<template>
  <HbFrame cls="hb-default" :size="props.size" :background="props.background">
    <div class="hb-content" :class="[props.subtitle ? 'has-sub' : '', props.align === 'top' ? 'is-top' : 'is-center']">
      <slot />
      <div v-if="props.subtitle" class="hb-subtitle">{{ props.subtitle }}</div>
    </div>
  </HbFrame>
</template>
