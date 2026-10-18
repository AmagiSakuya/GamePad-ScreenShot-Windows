<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script>
// 统一线性图标集（24×24，颜色继承 currentColor）
const ICONS = {
  camera: ['M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', 'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
  gamepad: ['M8 8h8a4 4 0 0 1 4 4v3a3 3 0 0 1-5.2 2L13 15h-2l-1.8 2A3 3 0 0 1 4 15v-3a4 4 0 0 1 4-4Z', 'M7 11h2', 'M8 10v2', 'M16 11h.01', 'M18 13h.01'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  save: ['M5 4h11l3 3v13H5Z', 'M9 4v5h6V4', 'M9 20v-5h6v5'],
  image: ['M4 5h16v14H4Z', 'M8 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z', 'M20 15l-4.5-4.5L7 19'],
  keyboard: ['M2 7h20v10H2Z', 'M6 11h.01', 'M10 11h.01', 'M14 11h.01', 'M18 11h.01', 'M8 14h8'],
  volume: ['M11 5 6 9H3v6h3l5 4Z', 'M16 9a4 4 0 0 1 0 6', 'M19 6a8 8 0 0 1 0 12'],
  volumeOff: ['M11 5 6 9H3v6h3l5 4Z', 'M17 9l4 6', 'M21 9l-4 6'],
  monitor: ['M2 5h20v13H2Z', 'M9 21h6'],
  appWindow: ['M3 6h18v13H3Z', 'M3 10h18'],
  target: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  refresh: ['M4 4v6h6', 'M20 20v-6h-6', 'M4 10a8 8 0 0 1 14-4', 'M20 14a8 8 0 0 1-14 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  play: ['M7 4l13 8-13 8Z'],
  stop: ['M6 6h12v12H6Z'],
  check: ['M4 12.5 9.5 18 20 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  link: ['M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3', 'M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7l1.3-1.3'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8', 'M13.7 21a2 2 0 0 1-3.4 0'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M4 20h16'],
  fileText: ['M5 4h11l3 3v13H5Z', 'M8 9h8', 'M8 13h5'],
  sliders: ['M4 8h10', 'M18 8h2', 'M4 16h4', 'M12 16h8', 'M16 5v6', 'M8 13v6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
  alert: ['M12 3 2 20h20Z', 'M12 9v5', 'M12 17h.01'],
  external: ['M14 4h6v6', 'M20 4l-8 8', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M5 5l1.5 1.5', 'M17.5 17.5 19 19', 'M19 5l-1.5 1.5', 'M6.5 17.5 5 19'],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'],
  languages: ['M3 6h10', 'M8 6c0 5-3 8-5 9', 'M5 9c0 3 3 5 6 6', 'M13 20l4-10 4 10', 'M14.5 16h5'],
  list: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  copy: ['M9 9h11v11H9Z', 'M5 15H4V4h11v1'],
  usb: ['M12 3v13', 'M12 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M12 7l-3-2', 'M12 9l3-2', 'M12 13l-3-2', 'M12 15l3-2'],
  dpad: ['M9 4h6v5h5v6h-5v5H9v-5H4V9h5Z'],
  wave: ['M2 12h3l2-6 3 12 3-9 2 3h7'],
  power: ['M12 4v8', 'M7.5 6.5a7 7 0 1 0 9 0'],
  language: ['M4 5h9v9H4Z', 'M7 9h3', 'M11 11l4 4', 'M13 20h8', 'M17 15l4 5'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3 11v4h6v-4a6 6 0 0 0-3-11Z'],
  minus: ['M5 12h14'],
  square: ['M6 6h12v12H6Z'],
  restore: ['M9 4h11v11', 'M4 9h11v11H4Z'],
  textSize: ['M3 6V4h13v2', 'M9.5 4v16', 'M7 20h5', 'M15 20l3-8 3 8', 'M16.2 17h3.6']
}

export default {
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 16 },
    strokeWidth: { type: [Number, String], default: 1.7 }
  },
  computed: {
    paths() {
      return ICONS[this.name] || ICONS.info
    }
  }
}
</script>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
