<template>
  <div class="gp-root">
    <!-- 手柄模式的按键提示条（不参与焦点导航） -->
    <transition name="gp-fade">
      <div v-if="padMode && hintVisible && !overlay" class="gp-hintbar" data-gp-skip>
        <span class="gp-hint-item"><GpGlyph kind="face" pos="bottom" />{{ $t('GpNav.hintOk') }}</span>
        <span class="gp-hint-item"><GpGlyph kind="face" pos="right" />{{ $t('GpNav.hintCancel') }}</span>
        <span class="gp-hint-item">
          <GpGlyph kind="shoulder" label="L" /><GpGlyph kind="shoulder" label="R" />{{ $t('GpNav.hintPage') }}
        </span>
        <span class="gp-hint-item"><GpGlyph kind="face" pos="left" />{{ $t('GpNav.hintHelp') }}</span>
        <span v-if="focusLabel" class="gp-hint-focus" :title="focusLabel">{{ focusLabel }}</span>
      </div>
    </transition>

    <!-- 按键说明（左方面键打开） -->
    <transition name="gp-fade">
      <div v-if="hintOpen" class="gp-help" data-gp-skip>
        <div class="gp-help-title">
          <AppIcon name="gamepad" :size="13" />{{ $t('GpNav.help') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys"><i class="gp-dpad">D-PAD</i></span>{{ $t('GpNav.helpMove') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys"><GpGlyph kind="face" pos="bottom" /></span>{{ $t('GpNav.helpOk') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys"><GpGlyph kind="face" pos="right" /></span>{{ $t('GpNav.helpBack') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys">
            <GpGlyph kind="shoulder" label="L" /><GpGlyph kind="shoulder" label="R" />
          </span>{{ $t('GpNav.helpPage') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys"><GpGlyph kind="face" pos="left" /></span>{{ $t('GpNav.helpHelp') }}
        </div>
        <div class="gp-help-row">
          <span class="gp-help-keys"><GpGlyph kind="menu" /></span>{{ $t('GpNav.helpExit') }}
        </div>
      </div>
    </transition>

    <!-- 覆盖层：下拉选项 -->
    <GpChooser v-if="overlay && overlay.kind === 'chooser'" v-bind="overlay.props" @done="onDone" />

    <!-- 覆盖层：软键盘 -->
    <GpKeyboard v-else-if="overlay && overlay.kind === 'keyboard'" v-bind="overlay.props" @done="onDone" />

    <!-- 覆盖层：文件夹选择 -->
    <GpPathPicker v-else-if="overlay && overlay.kind === 'folder'" v-bind="overlay.props" @done="onDone" />

    <!-- 覆盖层：确认框 -->
    <GpConfirm v-else-if="overlay && overlay.kind === 'confirm'" v-bind="overlay.props" @done="onDone" />
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import GpChooser from '@/components/GpChooser.vue'
import GpKeyboard from '@/components/GpKeyboard.vue'
import GpPathPicker from '@/components/GpPathPicker.vue'
import GpConfirm from '@/components/GpConfirm.vue'
import GpGlyph from '@/components/GpGlyph.vue'
import { gpNav, resolveOverlay } from '@/lib/gamepadNav'

export default {
  name: 'GpNavLayer',
  components: { AppIcon, GpChooser, GpKeyboard, GpPathPicker, GpConfirm, GpGlyph },
  computed: {
    padMode() {
      return gpNav.padMode
    },
    overlay() {
      return gpNav.overlay
    },
    hintOpen() {
      return gpNav.hintOpen
    },
    focusLabel() {
      return gpNav.focusLabel
    },
    hintVisible() {
      return gpNav.hintVisible
    }
  },
  methods: {
    onDone(value) {
      const overlay = gpNav.overlay
      if (!overlay) return
      // 覆盖层的返回值处理不能抛错：渲染进程有全局 errorHandler，异常会被判成致命错误
      try {
        resolveOverlay(overlay.id, value)
      } catch (error) {
        console.error('Gamepad overlay resolve failed:', error)
      }
    }
  }
}
</script>
