<template>
  <!-- 通用列表选择器：下拉框选项 / 简单列表都用它，按钮即焦点，手柄空间导航直接可用 -->
  <div class="gp-mask" data-gp-scope="overlay">
    <div class="gp-sheet" :class="{ wide }">
      <header class="gp-sheet-head">
        <div class="gp-sheet-title">{{ title }}</div>
        <div v-if="subtitle" class="gp-sheet-sub">{{ subtitle }}</div>
      </header>

      <div class="gp-sheet-body">
        <div class="gp-list">
          <button v-for="item in list" :key="item.id" class="gp-item"
            :class="{ on: item.selected, primary: item.primary, danger: item.danger }" :disabled="item.disabled"
            :title="item.hint || item.label" @click="$emit('done', item.id)">
            <span class="gp-item-label">{{ item.label }}</span>
            <span v-if="item.hint" class="gp-item-hint">{{ item.hint }}</span>
            <AppIcon v-if="item.selected" name="check" :size="12" />
          </button>
          <div v-if="!list.length" class="gp-empty">{{ $t('GpNav.emptyList') }}</div>
        </div>
      </div>

      <footer class="gp-sheet-foot">
        <button class="ui-btn" @click="$emit('done', null)">
          <AppIcon name="close" :size="12" />{{ cancelLabel || $t('GpNav.cancel') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'

export default {
  name: 'GpChooser',
  components: { AppIcon },
  emits: ['done'],
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    items: { type: Array, default: () => [] },
    cancelLabel: { type: String, default: '' },
    wide: { type: Boolean, default: false }
  },
  computed: {
    list() {
      return Array.isArray(this.items) ? this.items : []
    }
  }
}
</script>
