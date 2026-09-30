<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  src?: string
  caption?: string
  n?: string | number
  alt?: string
}>()

const failed = ref(false)
const source = computed(() => props.src?.trim() ?? '')
watch(source, () => { failed.value = false })
</script>

<template>
  <figure class="hb-figure">
    <div v-if="!source || failed" class="hb-figure-placeholder" role="img" :aria-label="alt || 'Image not supplied'">
      <span class="hb-figure-placeholder-icon" aria-hidden="true">▧</span>
      <span>Image not supplied</span>
    </div>
    <img v-else :src="source" :alt="alt || caption || ''" @error="failed = true">
    <figcaption v-if="caption || n !== undefined">
      <span v-if="n !== undefined" class="hb-figure-label">Figure {{ n }}:</span>
      <span v-if="caption"> {{ caption }}</span>
    </figcaption>
  </figure>
</template>

<style>
.hb-figure { display: flex; min-height: 0; flex-direction: column; align-items: center; justify-content: center; gap: 8px; margin: 0.35em 0; text-align: center; }
.hb-figure > img { display: block; width: auto; max-width: 100%; max-height: min(70vh, 560px); object-fit: contain; }
.hb-figure figcaption { color: #444; font-size: 0.8em; line-height: 1.25; }
.hb-figure-label { color: var(--hb-dark); font-weight: 700; }
.hb-figure-placeholder { display: flex; width: min(100%, 720px); min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 2px dashed #9aa8bc; background: rgba(233, 240, 250, 0.85); color: #53657b; font-size: 0.9em; }
.hb-figure-placeholder-icon { font-size: 2em; line-height: 1; }
</style>
