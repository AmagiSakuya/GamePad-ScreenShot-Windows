<template>
  <transition name="upd-fade">
    <div v-if="open" class="upd-mask" @click.self="onMaskClick">
      <div class="upd-card" role="dialog" aria-modal="true">
        <header class="upd-head">
          <div class="upd-ico" :class="toneClass">
            <AppIcon :name="iconName" :size="18" />
          </div>
          <div class="upd-titles">
            <h3 class="upd-title">{{ $t('Update.title') }}</h3>
            <p class="upd-sub">
              <template v-if="hasTarget">
                <span class="mono">v{{ state.currentVersion }}</span>
                <AppIcon name="chevronRight" :size="11" class="upd-arrow" />
                <span class="mono hl">v{{ state.latestVersion }}</span>
              </template>
              <template v-else>
                <span class="mono">v{{ state.currentVersion }}</span>
              </template>
            </p>
          </div>
          <button class="upd-close" :title="$t('ui.close')" @click="close">
            <AppIcon name="close" :size="13" />
          </button>
        </header>

        <div class="upd-body">
          <!-- 检查中 -->
          <div v-if="state.status === 'checking'" class="upd-center">
            <span class="upd-spinner"></span>
            <span>{{ $t('Update.checking') }}</span>
          </div>

          <!-- 已是最新 -->
          <div v-else-if="state.status === 'uptodate'" class="upd-center ok">
            <div class="upd-big-ico ok"><AppIcon name="check" :size="22" /></div>
            <div class="upd-center-title">{{ $t('Update.upToDate') }}</div>
            <div class="upd-center-desc">{{ $t('Update.upToDateDesc', { version: state.currentVersion }) }}</div>
          </div>

          <!-- 发现新版本 / 待下载 -->
          <template v-else-if="state.status === 'available' || state.status === 'manual'">
            <div class="upd-meta">
              <span v-if="state.size" class="upd-tag">{{ $t('Update.patchSize', { size: formatBytes(state.size) }) }}</span>
              <span v-if="state.mandatory" class="upd-tag danger">{{ $t('Update.mandatory') }}</span>
              <span class="upd-tag ghost">{{ state.mode === 'hot' ? $t('Update.inApp') : $t('Update.manualMode') }}</span>
              <span v-if="state.publishedAt" class="upd-date">{{ formatDate(state.publishedAt) }}</span>
            </div>
            <div class="upd-notes" :class="{ empty: !notesText }">
              <pre v-if="notesText">{{ notesText }}</pre>
              <span v-else>{{ $t('Update.noNotes') }}</span>
            </div>
            <p v-if="state.mode !== 'hot'" class="upd-hint">{{ $t('Update.manualHint') }}</p>
          </template>

          <!-- 下载中 -->
          <div v-else-if="state.status === 'downloading'" class="upd-progress-wrap">
            <div class="upd-progress-top">
              <span>{{ $t('Update.downloading') }}</span>
              <span class="mono">{{ state.progress.toFixed(1) }}%</span>
            </div>
            <div class="upd-bar"><i :style="{ width: state.progress + '%' }"></i></div>
            <div class="upd-progress-bottom">
              <span class="mono">{{ formatBytes(state.received) }} / {{ formatBytes(state.total) }}</span>
              <span class="mono">{{ state.speed ? formatBytes(state.speed) + '/s' : '' }}</span>
            </div>
            <div v-if="state.source" class="upd-source">
              <AppIcon name="globe" :size="11" />
              <span>{{ state.source }}</span>
            </div>
          </div>

          <!-- 已下载，等待重启 -->
          <div v-else-if="state.status === 'ready'" class="upd-center">
            <div class="upd-big-ico ok"><AppIcon name="download" :size="22" /></div>
            <div class="upd-center-title">{{ $t('Update.ready') }}</div>
            <div class="upd-center-desc">{{ $t('Update.readyDesc') }}</div>
          </div>

          <!-- 正在应用 -->
          <div v-else-if="state.status === 'applying'" class="upd-center">
            <span class="upd-spinner"></span>
            <span>{{ $t('Update.applying') }}</span>
          </div>

          <!-- 出错 -->
          <div v-else-if="state.status === 'error'" class="upd-center err">
            <div class="upd-big-ico err"><AppIcon name="alert" :size="22" /></div>
            <div class="upd-center-title">{{ $t('Update.failed') }}</div>
            <div class="upd-center-desc break">{{ state.error }}</div>
          </div>

          <!-- 空闲 -->
          <div v-else class="upd-center">
            <div class="upd-big-ico"><AppIcon name="refresh" :size="22" /></div>
            <div class="upd-center-desc">{{ $t('Update.idleHint') }}</div>
          </div>
        </div>

        <footer class="upd-foot">
          <button v-if="showReleaseLink" class="upd-btn ghost" @click="$emit('open-release')">
            {{ $t('Update.openRelease') }}
          </button>
          <div class="upd-spacer"></div>

          <template v-if="state.status === 'downloading'">
            <button class="upd-btn" @click="$emit('cancel')">{{ $t('Update.cancel') }}</button>
          </template>

          <template v-else-if="state.status === 'available'">
            <button class="upd-btn" @click="close">{{ $t('Update.later') }}</button>
            <button class="upd-btn primary" @click="$emit('download')">{{ $t('Update.downloadNow') }}</button>
          </template>

          <template v-else-if="state.status === 'manual'">
            <button class="upd-btn" @click="close">{{ $t('Update.later') }}</button>
            <button class="upd-btn primary" @click="$emit('open-release')">{{ $t('Update.gotoDownload') }}</button>
          </template>

          <template v-else-if="state.status === 'ready'">
            <button class="upd-btn" @click="close">{{ $t('Update.later') }}</button>
            <button class="upd-btn primary" @click="$emit('apply')">{{ $t('Update.restartInstall') }}</button>
          </template>

          <template v-else-if="state.status === 'applying'">
            <button class="upd-btn" disabled>{{ $t('Update.applying') }}</button>
          </template>

          <template v-else-if="state.status === 'error'">
            <button class="upd-btn" @click="close">{{ $t('Update.close') }}</button>
            <button class="upd-btn primary" @click="$emit('check')">{{ $t('Update.retry') }}</button>
          </template>

          <template v-else-if="state.status === 'checking'">
            <button class="upd-btn" @click="close">{{ $t('Update.cancel') }}</button>
          </template>

          <template v-else-if="state.status === 'uptodate'">
            <button class="upd-btn" @click="$emit('check')">{{ $t('Update.recheck') }}</button>
            <button class="upd-btn primary" @click="close">{{ $t('Update.close') }}</button>
          </template>

          <template v-else>
            <button class="upd-btn" @click="close">{{ $t('Update.close') }}</button>
            <button class="upd-btn primary" @click="$emit('check')">{{ $t('Update.checkNow') }}</button>
          </template>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'

export default {
  name: 'UpdateDialog',
  components: { AppIcon },
  emits: ['close', 'check', 'download', 'cancel', 'apply', 'open-release'],
  props: {
    open: { type: Boolean, default: false },
    state: { type: Object, required: true },
    notes: { type: String, default: '' }
  },
  computed: {
    notesText() {
      return String(this.notes || '').trim()
    },
    hasTarget() {
      return ['available', 'manual', 'downloading', 'ready', 'applying'].includes(this.state.status)
        && !!this.state.latestVersion
        && this.state.latestVersion !== this.state.currentVersion
    },
    toneClass() {
      if (this.state.status === 'error') return 'err'
      if (this.state.status === 'uptodate' || this.state.status === 'ready') return 'ok'
      if (['available', 'manual', 'downloading'].includes(this.state.status)) return 'new'
      return ''
    },
    iconName() {
      if (this.state.status === 'error') return 'alert'
      if (this.state.status === 'uptodate') return 'check'
      if (this.state.status === 'ready') return 'download'
      if (['available', 'manual', 'downloading'].includes(this.state.status)) return 'download'
      return 'refresh'
    },
    showReleaseLink() {
      return ['available', 'manual', 'error', 'uptodate', 'idle'].includes(this.state.status)
    }
  },
  methods: {
    close() {
      // 下载中不允许直接关闭，避免用户以为更新还在继续
      if (this.state.status === 'downloading' || this.state.status === 'applying') return
      this.$emit('close')
    },
    onMaskClick() {
      this.close()
    },
    formatBytes(bytes) {
      const value = Number(bytes) || 0
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
      return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
    },
    formatDate(input) {
      if (!input) return ''
      const date = new Date(input)
      if (Number.isNaN(date.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }
  }
}
</script>

<style scoped>
.upd-mask {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 5, 8, 0.62);
  backdrop-filter: blur(6px);
}

.upd-card {
  width: 520px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--line-strong);
  background: var(--surface-flat);
  box-shadow: 0 30px 80px -40px #000, 0 0 0 1px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  animation: upd-pop 0.2s ease;
}

@keyframes upd-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: none; }
}

.upd-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 15px 16px 13px;
  border-bottom: 1px solid var(--line);
}

.upd-ico {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--ink-2);
  border: 1px solid var(--line);
  flex: 0 0 auto;
}

.upd-ico.ok {
  color: var(--ok);
  background: rgba(60, 211, 158, 0.14);
  border-color: rgba(60, 211, 158, 0.32);
}

.upd-ico.err {
  color: var(--danger);
  background: rgba(251, 95, 118, 0.14);
  border-color: rgba(251, 95, 118, 0.32);
}

.upd-ico.new {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.upd-titles {
  min-width: 0;
  flex: 1 1 auto;
}

.upd-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--ink);
  letter-spacing: 0.01em;
}

.upd-sub {
  margin: 3px 0 0;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.upd-arrow {
  color: var(--ink-3);
}

.mono {
  font-family: "Cascadia Mono", Consolas, monospace;
}

.hl {
  color: var(--accent);
  font-weight: 600;
}

.upd-close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upd-close:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.upd-body {
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 96px;
}

.upd-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 14px 0 8px;
  color: var(--ink-2);
  font-size: 12px;
  text-align: center;
}

.upd-big-ico {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.upd-big-ico.ok {
  color: var(--ok);
  background: rgba(60, 211, 158, 0.12);
  border-color: rgba(60, 211, 158, 0.30);
}

.upd-big-ico.err {
  color: var(--danger);
  background: rgba(251, 95, 118, 0.12);
  border-color: rgba(251, 95, 118, 0.30);
}

.upd-center-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.upd-center-desc {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.6;
  max-width: 400px;
}

.upd-center-desc.break {
  word-break: break-all;
}

.upd-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  border-top-color: var(--accent);
  animation: upd-spin 0.8s linear infinite;
}

@keyframes upd-spin {
  to { transform: rotate(360deg); }
}

.upd-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 9px;
}

.upd-tag {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}

.upd-tag.ghost {
  color: var(--ink-3);
  background: transparent;
  border-color: var(--line);
}

.upd-tag.danger {
  color: var(--danger);
  background: rgba(251, 95, 118, 0.12);
  border-color: rgba(251, 95, 118, 0.30);
}

.upd-date {
  margin-left: auto;
  font-size: 10px;
  color: var(--ink-3);
}

.upd-notes {
  max-height: 210px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--field);
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.upd-notes.empty {
  color: var(--ink-3);
  font-style: italic;
}

.upd-notes pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.upd-hint {
  margin: 9px 0 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--warn);
}

.upd-progress-wrap {
  padding: 6px 0 2px;
}

.upd-progress-top,
.upd-progress-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-2);
}

.upd-progress-bottom {
  margin-top: 5px;
  font-size: 10px;
  color: var(--ink-3);
}

.upd-bar {
  margin-top: 7px;
  height: 6px;
  border-radius: 99px;
  background: var(--surface-2);
  overflow: hidden;
}

.upd-bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--accent), var(--accent-hi));
  transition: width 0.25s ease;
}

.upd-source {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--ink-3);
}

.upd-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--line);
}

.upd-spacer {
  flex: 1 1 auto;
}

.upd-btn {
  height: 30px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
}

.upd-btn:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--line-strong);
  background: var(--surface-flat);
}

.upd-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.upd-btn.primary {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-ink);
}

.upd-btn.primary:hover:not(:disabled) {
  background: var(--accent-hi);
  color: var(--accent-ink);
}

.upd-btn.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--ink-3);
}

.upd-btn.ghost:hover {
  color: var(--ink-2);
  background: transparent;
}

.upd-fade-enter-active,
.upd-fade-leave-active {
  transition: opacity 0.18s ease;
}

.upd-fade-enter-from,
.upd-fade-leave-to {
  opacity: 0;
}
</style>
