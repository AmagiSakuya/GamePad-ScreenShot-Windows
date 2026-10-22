#!/usr/bin/env node
/**
 * 语言包完整性自检
 * =========================================================
 * 新增界面文案时，最容易只补 zh / en，其余语言静默回退成英文
 * （main.js 里 fallbackLocale: 'en'，界面上看不出报错）。
 * 这个脚本把「漏翻」变成一条明确的失败：
 *   1. 各语言文件的键是否与基准语言完全一致（缺 / 多）
 *   2. 占位符是否一致（{speed}、{dropped} 漏一个，界面上就会少个数字）
 *   3. 有没有空译文、裸花括号、vue-i18n 的保留字符（| @）误用
 *
 * 用法：
 *   node scripts/locale-check.js              检查，只在终端输出
 *   node scripts/locale-check.js --base en    指定基准语言（默认 zh）
 *   node scripts/locale-check.js --json       额外输出机器可读结果
 *
 * 退出码：0 = 全部一致；1 = 有不一致（可直接接 CI / precommit）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const LOCALE_DIR = path.join(ROOT, 'src/locales')

const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const BASE = argValue('--base', 'zh').replace(/\.json$/, '')
const AS_JSON = argv.includes('--json')

/* =========================================================
   工具
   ========================================================= */
function flatten(obj, prefix = '', out = {}) {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out)
    else out[full] = value
  }
  return out
}

const placeholders = (text) => (String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join('')

function loadLocales() {
  if (!fs.existsSync(LOCALE_DIR)) {
    console.error(`✗ 找不到语言目录：${LOCALE_DIR}`)
    process.exit(1)
  }
  const files = fs.readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.json'))
  const locales = {}
  for (const file of files) {
    const code = file.replace(/\.json$/, '')
    const full = path.join(LOCALE_DIR, file)
    try {
      locales[code] = flatten(JSON.parse(fs.readFileSync(full, 'utf8')))
    } catch (error) {
      console.error(`✗ ${file} 不是合法 JSON：${error.message}`)
      process.exit(1)
    }
  }
  return locales
}

/* =========================================================
   检查
   ========================================================= */
function main() {
  const locales = loadLocales()
  const codes = Object.keys(locales).sort()
  if (!locales[BASE]) {
    console.error(`✗ 基准语言 ${BASE}.json 不存在`)
    process.exit(1)
  }

  const base = locales[BASE]
  const baseKeys = Object.keys(base)
  const problems = []

  for (const code of codes) {
    if (code === BASE) continue
    const target = locales[code]

    const missing = baseKeys.filter((k) => !(k in target))
    const extra = Object.keys(target).filter((k) => !(k in base))

    for (const key of missing) problems.push({ code, key, type: 'missing', detail: `缺少译文（基准值：${base[key]}）` })
    for (const key of extra) problems.push({ code, key, type: 'extra', detail: '基准语言里没有这个键，可能是拼错或已废弃' })

    for (const key of baseKeys) {
      if (!(key in target)) continue
      const value = target[key]
      const text = String(value)
      if (typeof value !== 'string') {
        problems.push({ code, key, type: 'type', detail: '译文不是字符串（疑似嵌套结构写错）' })
        continue
      }
      if (!text.trim()) {
        problems.push({ code, key, type: 'empty', detail: '译文为空' })
        continue
      }
      const want = placeholders(base[key])
      const got = placeholders(text)
      if (want !== got) {
        problems.push({ code, key, type: 'placeholder', detail: `占位符不一致（基准：${want || '无'}／本条：${got || '无'}）` })
      }
      const braces = text.replace(/\{[a-zA-Z0-9_]+\}/g, '')
      if (/[{}]/.test(braces)) problems.push({ code, key, type: 'brace', detail: '有多余的花括号' })
      if (/[|@]/.test(text)) problems.push({ code, key, type: 'reserved', detail: 'vue-i18n 把 | @ 当语法，界面文案里应避免' })
    }
  }

  /* ---------------- 输出 ---------------- */
  const byCode = {}
  for (const p of problems) (byCode[p.code] = byCode[p.code] || []).push(p)

  console.log(`语言包自检（基准 ${BASE}.json，共 ${baseKeys.length} 条文案，${codes.length} 种语言）`)
  console.log('─'.repeat(64))
  for (const code of codes) {
    const list = byCode[code] || []
    if (!list.length) {
      console.log(`  ✓ ${code.padEnd(6)} 一致`)
      continue
    }
    const missing = list.filter((p) => p.type === 'missing').length
    const extra = list.filter((p) => p.type === 'extra').length
    const other = list.length - missing - extra
    console.log(`  ✗ ${code.padEnd(6)} 缺 ${missing} · 多 ${extra} · 其他 ${other}`)
    for (const p of list.slice(0, 15)) console.log(`      ${p.key} — ${p.detail}`)
    if (list.length > 15) console.log(`      …还有 ${list.length - 15} 条`)
  }
  console.log('─'.repeat(64))

  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, totalKeys: baseKeys.length, problems }, null, 2))
  }

  if (problems.length) {
    console.log(`✗ 共 ${problems.length} 处不一致。界面语言非 zh 时会静默回退英文，请补齐。`)
    process.exit(1)
  }
  console.log('✓ 全部语言一致')
}

main()
