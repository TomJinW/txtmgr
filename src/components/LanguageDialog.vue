<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t, type AppLanguage } from "../i18n";

const props = defineProps<{
  currentLanguage: AppLanguage;
}>();

const emit = defineEmits<{
  close: [];
  select: [language: AppLanguage];
}>();

const selectedLanguage = ref<AppLanguage>(props.currentLanguage);

watch(
  () => props.currentLanguage,
  (language) => {
    selectedLanguage.value = language;
  },
);

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
});

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}

function applyLanguage() {
  emit("select", selectedLanguage.value);
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="language-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-dialog-title"
      @submit.prevent="applyLanguage"
    >
      <h2 id="language-dialog-title">{{ t("app.language") }}</h2>

      <div class="language-options">
        <label>
          <input v-model="selectedLanguage" type="radio" value="en" />
          <span>English</span>
        </label>
        <label>
          <input v-model="selectedLanguage" type="radio" value="zh-Hans" />
          <span>简体中文</span>
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit">{{ t("common.apply") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(15 23 42 / 35%);
}

.language-dialog {
  width: min(340px, 100%);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 20px 50px rgb(15 23 42 / 22%);
}

.language-dialog h2 {
  margin: 0 0 14px;
  font-size: 17px;
  line-height: 1.2;
}

.language-options {
  display: grid;
  gap: 8px;
}

.language-options label {
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--control-bg);
}

.language-options input {
  margin: 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--control-bg);
}

.dialog-actions button[type="submit"] {
  border-color: var(--primary);
  color: #fff;
  background: var(--primary);
}
</style>
