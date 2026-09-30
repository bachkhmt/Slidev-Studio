<!--
  Trang bìa (\titlepage). Đọc từ headmatter: title, institute, author, date.
  ---
  layout: cover
  ---
-->
<script setup lang="ts">
import { computed } from 'vue'
import { configs } from '@slidev/client'
import HbFrame from '../components/HbFrame.vue'
import bundledLogo from '../assets/bk_logo.png'

const cfg = configs as Record<string, any>
const coverLogo = computed(() => cfg.logo === false ? undefined : cfg.logo || bundledLogo)
const authors = computed(() => {
  if (Array.isArray(cfg.authors) && cfg.authors.length)
    return cfg.authors.map((person: unknown) => typeof person === 'string' ? person : String((person as any)?.name ?? '')).filter(Boolean).join(' · ')
  return String(cfg.author ?? '')
})
</script>

<template>
  <HbFrame cls="hb-cover" :titled="false">
    <div class="hb-cover-body">
      <div class="hb-titlebox">{{ cfg.title }}</div>
      <img v-if="coverLogo" :src="coverLogo" class="hb-logo" alt="Logo HCMUT">
      <div class="hb-institute">{{ cfg.institute }}</div>
      <div class="hb-author">{{ authors }}</div>
      <div v-if="cfg.advisor" class="hb-advisor">Cố vấn: {{ cfg.advisor }}</div>
      <div class="hb-date">{{ cfg.date }}</div>
    </div>
  </HbFrame>
</template>

<style>
.hb-cover-body { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 25px 28px 0; }
.hb-titlebox {
  box-sizing: border-box;
  width: 100%;
  padding: 18px 22px;
  border-radius: 17px;
  background: var(--hb-light);
  color: #fff;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.25;
}
.hb-logo { width: 136px; margin-top: 22px; }
.hb-institute { margin-top: 12px; font-size: 22px; }
.hb-author { margin-top: 25px; font-size: 24px; }
.hb-advisor { margin-top: 10px; font-size: 19px; }
.hb-date { margin-top: 44px; font-size: 22px; }
</style>
