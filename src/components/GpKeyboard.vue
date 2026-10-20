<template>
  <!-- 软键盘：手柄模式下替代物理键盘输入（路径、代理地址、OBS 密码等） -->
  <div class="gp-mask" data-gp-scope="overlay">
    <div class="gp-sheet gp-keyboard">
      <header class="gp-sheet-head">
        <div class="gp-sheet-title">{{ title || $t('GpNav.inputTitle') }}</div>
        <div class="gp-kb-preview" :class="{ empty: !text }">
          <span class="gp-kb-text">{{ text.slice(0, pos) }}<i class="gp-caret"></i>{{ text.slice(pos) }}</span>
          <span v-if="!text && placeholder" class="gp-kb-placeholder">{{ placeholder }}</span>
        </div>
      </header>

      <div class="gp-sheet-body">
        <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="gp-kb-row">
          <button v-for="key in row" :key="key.id" class="gp-key" :class="key.cls" @click="press(key)">
            <AppIcon v-if="key.icon" :name="key.icon" :size="13" />
            <template v-else>{{ key.label }}</template>
          </button>
        </div>
      </div>

      <footer class="gp-sheet-foot end">
        <span class="gp-kb-tip">{{ $t('GpNav.keyboardTip') }}</span>
        <span class="gp-spacer"></span>
        <button class="ui-btn" @click="$emit('done', null)">
          <AppIcon name="close" :size="12" />{{ $t('GpNav.cancel') }}
        </button>
        <button class="ui-btn primary" @click="$emit('done', text)">
          <AppIcon name="check" :size="12" />{{ $t('GpNav.finish') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROW_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const ROW_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-']
const ROW_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '/']
const SYMBOL_1 = [':', '\\', '@', '#', '&', '%', '+', '=', '?', '!']
const SYMBOL_2 = ['*', '(', ')', '[', ']', "'", '"', ' ', '<', '>']

export default {
  name: 'GpKeyboard',
  components: { AppIcon },
  emits: ['done'],
  props: {
    title: { type: String, default: '' },
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  data() {
    return {
      text: typeof this.value === 'string' ? this.value : '',
      pos: typeof this.value === 'string' ? this.value.length : 0,
      shift: false
    }
  },
  computed: {
    rows() {
      const chars = (list) => list.map((char) => ({
        id: char,
        label: this.shift ? char.toUpperCase() : char,
        type: 'char',
        char: this.shift ? char.toUpperCase() : char,
        cls: 'char'
      }))
      return [
        chars(DIGITS),
        chars(ROW_1),
        chars(ROW_2),
        chars(ROW_3),
        chars(SYMBOL_1),
        chars(SYMBOL_2),
        [
          { id: 'shift', label: this.shift ? this.$t('GpNav.lowercase') : this.$t('GpNav.uppercase'), type: 'shift', cls: 'fn' },
          { id: 'left', label: '', icon: 'chevronRight', type: 'left', cls: 'fn flip' },
          { id: 'right', label: '', icon: 'chevronRight', type: 'right', cls: 'fn' },
          { id: 'back', label: this.$t('GpNav.backspace'), type: 'back', cls: 'fn wide' },
          { id: 'clear', label: this.$t('GpNav.clearAll'), type: 'clear', cls: 'fn' }
        ]
      ]
    }
  },
  methods: {
    press(key) {
      if (!key) return
      switch (key.type) {
        case 'char':
          this.text = this.text.slice(0, this.pos) + key.char + this.text.slice(this.pos)
          this.pos += key.char.length
          break
        case 'shift':
          this.shift = !this.shift
          break
        case 'back':
          if (this.pos > 0) {
            this.text = this.text.slice(0, this.pos - 1) + this.text.slice(this.pos)
            this.pos -= 1
          }
          break
        case 'clear':
          this.text = ''
          this.pos = 0
          break
        case 'left':
          this.pos = Math.max(0, this.pos - 1)
          break
        case 'right':
          this.pos = Math.min(this.text.length, this.pos + 1)
          break
        default:
          break
      }
    }
  }
}
</script>
