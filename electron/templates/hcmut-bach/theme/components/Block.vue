<script setup lang="ts">
/**
 * \begin{block} / alertblock / exampleblock
 * <Block title="Mục tiêu chung">…</Block>
 * <Block type="alert" title="Vấn đề đặt ra">…</Block>
 * <Block type="example" title="Ví dụ">…</Block>
 */
withDefaults(defineProps<{ title?: string, type?: 'block' | 'alert' | 'example' }>(), { type: 'block' })
</script>

<template>
  <div class="hb-block" :class="`is-${type}`">
    <div v-if="title" class="hb-block-title">{{ title }}</div>
    <div class="hb-block-body"><slot /></div>
  </div>
</template>

<style>
.hb-block { margin: 0.6em 0; border-radius: 3px; overflow: hidden; --c: var(--hb-dark); --t: var(--hb-tint); }
.hb-block-title { padding: 5px 12px; background: var(--c); color: #fff; font-weight: 700; }
.hb-block-body { padding: 8px 12px; background: var(--t); }
.hb-block-body > :first-child { margin-top: 0; }
.hb-block-body > :last-child { margin-bottom: 0; }
/* exampleblock: tiêu đề nền trắng, chữ xanh đậm (\setbeamercolor{block title example}) */
.hb-block.is-example .hb-block-title { background: #fff; color: var(--hb-dark); border-bottom: 2px solid var(--hb-dark); }
.hb-block.is-example .hb-block-body { background: var(--hb-tint); }
/* SudaBeamer alertblock: red label, no colored title bar or tinted body. */
.hb-block.is-alert { overflow: visible; border-radius: 0; }
.hb-block.is-alert .hb-block-title { padding: 0; background: transparent; color: var(--hb-alert); }
.hb-block.is-alert .hb-block-body { padding: 4px 0 0; background: transparent; }
</style>
