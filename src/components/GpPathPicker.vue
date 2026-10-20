<template>
  <!-- 应用内文件夹选择器：手柄模式下替代系统「选择文件夹」对话框，逐级浏览 + 直接确认 -->
  <div class="gp-mask" data-gp-scope="overlay">
    <div class="gp-sheet gp-picker">
      <header class="gp-sheet-head">
        <div class="gp-sheet-title">{{ title || $t('GpNav.chooseFolder') }}</div>
        <div class="gp-path-bar" :title="current">
          <AppIcon name="folder" :size="12" />
          <span class="gp-path">{{ current || $t('GpNav.loading') }}</span>
        </div>
      </header>

      <div class="gp-sheet-body">
        <div v-if="quick.length" class="gp-quick">
          <button v-for="item in quick" :key="item.path" class="gp-chip" :title="item.path"
            @click="load(item.path)">
            {{ $t('GpNav.quick.' + item.key) }}
          </button>
        </div>

        <div class="gp-list gp-dir-list">
          <button v-if="parent" class="gp-item" @click="load(parent)">
            <AppIcon name="chevronRight" :size="12" class="gp-up" />
            <span class="gp-item-label">{{ $t('GpNav.parentFolder') }}</span>
            <span class="gp-item-hint">{{ parent }}</span>
          </button>

          <button v-for="dir in dirs" :key="dir.path" class="gp-item" :title="dir.path" @click="load(dir.path)">
            <AppIcon name="folder" :size="13" />
            <span class="gp-item-label">{{ dir.name }}</span>
          </button>

          <div v-if="loading" class="gp-empty">{{ $t('GpNav.loading') }}</div>
          <div v-else-if="error" class="gp-empty error">{{ error }}</div>
          <div v-else-if="!dirs.length" class="gp-empty">{{ $t('GpNav.emptyFolder') }}</div>

          <template v-if="drives.length">
            <div class="gp-group-label">{{ $t('GpNav.drives') }}</div>
            <div class="gp-drive-row">
              <button v-for="drive in drives" :key="drive.path" class="gp-chip" @click="load(drive.path)">
                {{ drive.name }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <footer class="gp-sheet-foot">
        <span class="gp-picker-path" :title="current">{{ $t('GpNav.currentFolder') }}：{{ current || '-' }}</span>
        <span class="gp-spacer"></span>
        <button class="ui-btn" @click="$emit('done', null)">
          <AppIcon name="close" :size="12" />{{ cancelLabel || $t('GpNav.cancel') }}
        </button>
        <button class="ui-btn primary" data-gp-autofocus :disabled="!current" @click="confirm">
          <AppIcon name="check" :size="12" />{{ $t('GpNav.pickThisFolder') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { refocusOverlay } from '@/lib/gamepadNav'

export default {
  name: 'GpPathPicker',
  components: { AppIcon },
  emits: ['done'],
  props: {
    startPath: { type: String, default: '' },
    title: { type: String, default: '' },
    cancelLabel: { type: String, default: '' }
  },
  data() {
    return {
      current: '',
      parent: '',
      dirs: [],
      drives: [],
      quick: [],
      loading: false,
      error: ''
    }
  },
  mounted() {
    this.load(this.startPath)
  },
  methods: {
    async load(target) {
      this.loading = true
      this.error = ''
      let result = null
      try {
        result = await window.electronAPI.listDirectories(target || '')
      } catch (e) {
        result = null
      }
      this.loading = false
      if (!result || result.error) {
        this.error = this.$t('GpNav.loadFailed')
        this.dirs = []
        refocusOverlay()
        return
      }
      this.current = result.path || ''
      this.parent = result.parent || ''
      this.dirs = Array.isArray(result.dirs) ? result.dirs : []
      this.drives = Array.isArray(result.drives) ? result.drives : []
      this.quick = Array.isArray(result.quick) ? result.quick : []
      refocusOverlay()
    },
    confirm() {
      if (!this.current) return
      this.$emit('done', this.current)
    }
  }
}
</script>
