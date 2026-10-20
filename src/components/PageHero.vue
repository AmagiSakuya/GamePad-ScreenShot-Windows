<template>
  <!--
    页面顶部的状态横幅（截图页 / 映射页共用）。
    两个页面的「启动」区域由这里统一：左侧标签 + 标题 + 可选内容，右侧一组操作按钮，
    底部一条 meta 信息栏。样式只在这里维护，避免两个页面各写一套导致风格漂移。
  -->
  <section class="hero" :class="{ live }">
    <div class="hero-main">
      <div class="hero-left">
        <div class="hero-tag">
          <span class="hero-dot"></span>{{ tag }}
        </div>
        <h2 class="hero-title">
          {{ title }}
          <span v-if="sub" class="hero-sub">{{ sub }}</span>
        </h2>
        <div v-if="$slots.body" class="hero-body">
          <slot name="body" />
        </div>
      </div>

      <div class="hero-actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="$slots.meta" class="hero-meta">
      <slot name="meta" />
    </div>
  </section>
</template>

<script>
export default {
  name: 'PageHero',
  props: {
    // 是否处于运行态：控制边框、光晕、标签与指示灯的颜色
    live: { type: Boolean, default: false },
    // 左上角小标签（英文短词，全大写）
    tag: { type: String, default: '' },
    // 主标题
    title: { type: String, default: '' },
    // 标题右侧的补充说明
    sub: { type: String, default: '' }
  }
}
</script>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  padding: 12px 16px 7px;
  margin-bottom: 9px;
  transition: border-color 0.25s ease, background 0.25s ease;
}

.hero.live {
  border-color: var(--accent-line);
  background:
    radial-gradient(520px 200px at 92% 30%, var(--accent-soft), transparent 70%),
    linear-gradient(112deg, var(--violet-soft), rgba(20, 24, 33, 0) 48%),
    var(--surface);
}

:global(html.theme-light) .hero.live {
  background:
    radial-gradient(520px 200px at 92% 30%, var(--accent-soft), transparent 70%),
    linear-gradient(112deg, var(--violet-soft), rgba(255, 255, 255, 0) 48%),
    var(--surface);
}

.hero::after {
  content: "";
  position: absolute;
  right: -70px;
  top: -80px;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, var(--accent-soft), var(--cyan-soft), transparent 62%);
  filter: blur(30px);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.hero.live::after {
  opacity: 1;
}

.hero-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.hero-left {
  min-width: 0;
}

.hero-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--ink-3);
}

.hero.live .hero-tag {
  color: var(--accent);
}

.hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-3);
}

.hero.live .hero-dot {
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
  animation: heroPulse 1.8s ease-in-out infinite;
}

@keyframes heroPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.hero-title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 5px 0 0;
  line-height: 1.25;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-sub {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--ink-3);
}

.hero-body {
  margin-top: 8px;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  position: relative;
  z-index: 1;
  overflow: hidden;
  white-space: nowrap;
}

.hero-meta > :deep(*) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-meta :deep(b) {
  color: var(--ink-2);
  font-weight: 600;
  margin-left: 6px;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
  display: inline-block;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.hero-meta :deep(b.warn) {
  color: var(--warn);
}

.hero-meta :deep(b.ok) {
  color: var(--ok);
}

/* 窄窗口：操作按钮换到下一行，避免挤压标题 */
@media (max-width: 720px) {
  .hero-main {
    flex-wrap: wrap;
    row-gap: 10px;
  }

  .hero-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
