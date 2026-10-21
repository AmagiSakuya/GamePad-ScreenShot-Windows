<template>
  <!-- 应用内确认框：替代 dialog.showMessageBox。
       鼠标 / 键盘 / 手柄三种输入都走同一个组件，样式跟随应用主题，
       不再弹出系统那种白底 Messagebox。 -->
  <div class="gp-mask" data-gp-scope="overlay">
    <div class="gp-sheet gp-confirm" role="dialog" aria-modal="true">
      <header class="gp-sheet-head">
        <div class="gp-sheet-title">
          <span class="gp-confirm-ico" :class="{ danger }">
            <AppIcon :name="iconName" :size="14" />
          </span>
          <span class="gp-confirm-title">{{ title }}</span>
          <button class="gp-sheet-close" type="button" :title="cancelLabel" @click="cancel">
            <AppIcon name="close" :size="12" />
          </button>
        </div>
      </header>

      <div class="gp-sheet-body">
        <p class="gp-confirm-msg">{{ message }}</p>
        <p v-if="detail" class="gp-confirm-detail">{{ detail }}</p>
      </div>

      <footer class="gp-sheet-foot end">
        <button class="ui-btn" type="button" @click="cancel">
          {{ cancelLabel }}
        </button>
        <!-- 手柄模式打开时默认落在这里（openOverlay 认 data-gp-autofocus） -->
        <button class="ui-btn" :class="danger ? 'danger' : 'primary'" type="button"
          data-gp-autofocus @click="ok">
          {{ okLabel }}
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
    danger: { type: Boolean, default: false },
    // info / alert / check / shield …；不传时按 danger 自动选
    icon: { type: String, default: '' }
  },
  computed: {
    iconName() {
      if (this.icon) return this.icon
      return this.danger ? 'alert' : 'info'
    }
  },
  mounted() {
    // 打开即接管键盘：Esc 取消、Enter 确认。
    // 用捕获阶段 + stopPropagation，避免同一次 Esc 又把下层页面的弹窗关掉。
    this._onKey = (event) => {
      if (this._done) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        this.cancel()
        return
      }
      if (event.key === 'Enter') {
        // 焦点已经在按钮上时交给按钮自己的默认行为，别重复触发
        const active = document.activeElement
        if (active && active.closest && active.closest('.gp-confirm') && active.tagName === 'BUTTON') return
        event.preventDefault()
        event.stopPropagation()
        this.ok()
      }
    }
    window.addEventListener('keydown', this._onKey, true)
  },
  beforeUnmount() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true)
  },
  methods: {
    /** 无论走按钮、Esc 还是关闭叉，都只 resolve 一次 */
    finish(value) {
      if (this._done) return
      this._done = true
      this.$emit('done', value)
    },
    ok() {
      this.finish('ok')
    },
    cancel() {
      this.finish('cancel')
    }
  }
}
</script>
