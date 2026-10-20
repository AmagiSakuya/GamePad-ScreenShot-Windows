<template>
  <!-- 手柄模式下的确认框：替代 dialog.showMessageBox，纯界面内按钮，可用手柄选择 -->
  <div class="gp-mask" data-gp-scope="overlay">
    <div class="gp-sheet gp-confirm">
      <header class="gp-sheet-head">
        <div class="gp-sheet-title">
          <AppIcon :name="danger ? 'alert' : 'check'" :size="13" :class="{ 'gp-danger-ico': danger }" />
          {{ title }}
        </div>
      </header>

      <div class="gp-sheet-body">
        <p class="gp-confirm-msg">{{ message }}</p>
        <p v-if="detail" class="gp-confirm-detail">{{ detail }}</p>
      </div>

      <footer class="gp-sheet-foot end">
        <button class="ui-btn" @click="$emit('done', 'cancel')">
          <AppIcon name="close" :size="12" />{{ cancelLabel }}
        </button>
        <button class="ui-btn" :class="danger ? 'danger' : 'primary'" @click="$emit('done', 'ok')">
          <AppIcon name="check" :size="12" />{{ okLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'

export default {
  name: 'GpConfirm',
  components: { AppIcon },
  emits: ['done'],
  props: {
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    detail: { type: String, default: '' },
    okLabel: { type: String, default: '' },
    cancelLabel: { type: String, default: '' },
    danger: { type: Boolean, default: false }
  }
}
</script>
