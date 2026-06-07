<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";

defineProps<{
  maxRow: number;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const model = defineModel<string>({ required: true });
const input = ref<HTMLInputElement | null>(null);

watch(
  input,
  async () => {
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
  { immediate: true },
);
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="go-to-row-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="go-to-row-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="go-to-row-dialog-title">{{ t("main.goToRow") }}</h2>
      <label for="go-to-row-dialog-input">{{ t("main.rows") }}</label>
      <input
        id="go-to-row-dialog-input"
        ref="input"
        v-model="model"
        type="number"
        min="1"
        :max="maxRow || undefined"
        inputmode="numeric"
        @keydown.escape="emit('close')"
      />
      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="maxRow === 0">{{ t("main.go") }}</button>
      </div>
    </form>
  </div>
</template>
