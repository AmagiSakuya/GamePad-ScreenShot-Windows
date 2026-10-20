<template>
  <!--
    通用手柄按键图示：不写 A/B/X/Y，只画「位置」。
    四个面键按 上 / 左 / 右 / 下 排布，当前说的是哪个就把哪个涂实
    （和 Steam 的通用手柄提示一致，任何品牌的手柄都能对上号）。
  -->
  <i v-if="kind === 'face'" class="gp-glyph" aria-hidden="true">
    <svg viewBox="0 0 16 16" focusable="false">
      <circle cx="8" cy="3.1" r="2.5" :class="{ on: pos === 'top' }" />
      <circle cx="3.1" cy="8" r="2.5" :class="{ on: pos === 'left' }" />
      <circle cx="12.9" cy="8" r="2.5" :class="{ on: pos === 'right' }" />
      <circle cx="8" cy="12.9" r="2.5" :class="{ on: pos === 'bottom' }" />
    </svg>
  </i>
  <i v-else-if="kind === 'shoulder'" class="gp-glyph" aria-hidden="true">
    <span class="gp-glyph-pill">{{ label }}</span>
  </i>
  <i v-else class="gp-glyph" aria-hidden="true">
    <span class="gp-glyph-pill menu">≡</span>
  </i>
</template>

<script>
export default {
  name: 'GpGlyph',
  props: {
    /** face = 面键四向图 / shoulder = 肩键 L·R / menu = 菜单键 */
    kind: { type: String, default: 'face' },
    /** kind=face 时高亮的位置 */
    pos: { type: String, default: 'bottom' },
    /** kind=shoulder 时显示的字母 */
    label: { type: String, default: 'L' }
  }
}
</script>
