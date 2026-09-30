<script setup lang="ts">
defineProps<{ n: string | number, href?: string }>()
</script>

<template>
  <div class="hb-reference-item">
    <span class="hb-reference-number">[{{ n }}]</span>
    <a v-if="href" :href="href" target="_blank" rel="noreferrer"><slot /></a>
    <span v-else><slot /></span>
  </div>
</template>

<style>
.hb-reference-item { display: grid; grid-template-columns: 3.2em minmax(0, 1fr); gap: 0.35em; align-items: start; margin: 0.35em 0; font-size: 0.82em; line-height: 1.35; }
.hb-reference-number { color: var(--hb-dark); font-weight: 700; font-variant-numeric: tabular-nums; }
.hb-reference-item a { color: var(--hb-light); }
</style>
