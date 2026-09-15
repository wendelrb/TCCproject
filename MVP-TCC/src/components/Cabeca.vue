<script setup lang="ts">
defineProps<{ titulo: string; sub?: string }>();
</script>

<template>
  <div class="cabeca surge">
    <h1>{{ titulo }}</h1>
    <p v-if="sub" class="sub">{{ sub }}</p>
    <div v-if="$slots.acoes" class="acoes"><slot name="acoes" /></div>
  </div>
</template>

<style scoped>
.cabeca {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px 16px;
  margin-bottom: 18px;
}
h1 { flex: 0 0 auto; }
.sub { flex: 1 1 340px; max-width: 70ch; }
.acoes { flex: 0 0 auto; margin-left: auto; }
</style>
