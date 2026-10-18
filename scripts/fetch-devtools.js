#!/usr/bin/env node
'use strict'

/**
 * 把 Vue DevTools 扩展下载并解包到 <项目根>/devtools-extension
 * 之后 `npm run electron:serve` 会直接加载这个本地目录，不再联网。
 *
 * ── 常用用法 ────────────────────────────────────────────────────────────
 *   npm run devtools:fetch                          # 直连；失败会自动探测本机代理端口再试
 *   npm run devtools:fetch -- --proxy auto          # 强制先探测本地代理（Clash / v2ray 等）
 *   npm run devtools:fetch -- --proxy http://127.0.0.1:7890
 *   npm run devtools:fetch --proxy http://127.0.0.1:7890   # npm 自身吃掉 --proxy，效果等同
 *   npm run devtools:fetch -- --file ./xxx.crx      # 用自己下好的 .crx / .zip（完全离线）
 *   npm run devtools:fetch -- --mirror <URL>        # 自定义下载源，URL 里的 {id} 会被替换
 *
 * ── 代理读取优先级（第一个命中的生效）──────────────────────────────────
 *   1. 命令行 --proxy <url>（支持 http:// https:// socks5://，或 auto / none）
 *   2. npm 配置：--proxy=xxx 或 npm_config_proxy / npm_config_https_proxy
 *   3. 环境变量：HTTPS_PROXY / HTTP_PROXY / ALL_PROXY（大小写都认）
 *   4. Windows 系统代理（注册表 Internet Settings）
 *   5. 以上都没有 → 先直连，直连全挂再自动扫本机常见代理端口
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const https = require('https')
const tls = require('tls')
const zlib = require('zlib')
const { execFileSync } = require('child_process')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'devtools-extension')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Vue DevTools：Chrome 商店 ID / Edge 商店 ID
const CHROME_ID = 'ljjemllljcmogpfapbkkighbhhppjdbg'
const EDGE_ID = 'olofadcdnkkjdfgjcmjaadnlehnnihnl'

const DOWNLOAD_SOURCES = [
  {
    name: 'Edge 商店',
    id: EDGE_ID,
    url: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&prod=chromiumcrx&prodchannel=&prodversion=120.0.0.0&x=id%3D{id}%26uc'
  },
  {
    name: 'Chrome 商店',
    id: CHROME_ID,
    url: 'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D{id}%26uc&prodversion=120.0.0.0'
  }
]

/** 自动探测代理时依次尝试的本机端口（Clash / Clash Verge / v2rayN / Shadowsocks / 通用） */
const LOCAL_PROXY_PORTS = (() => {
  const custom = String(process.env.DEVTOOLS_PROXY_PORTS || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536)
  return custom.length ? custom : [7890, 7897, 10809, 10808, 1080, 8888, 8080, 33210, 4780]
})()

//#region 参数解析
function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, force: false, proxy: undefined }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--file') args.file = argv[++i]
    else if (arg === '--out') args.out = path.resolve(argv[++i])
    else if (arg === '--mirror') args.mirror = argv[++i]
    else if (arg === '--id') args.id = argv[++i]
    else if (arg === '--proxy') {
      // 允许 --proxy 后面不带值，等价于 --proxy auto
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        args.proxy = next
        i++
      } else {
        args.proxy = 'auto'
      }
    } else if (arg.startsWith('--proxy=')) {
      args.proxy = arg.slice('--proxy='.length) || 'auto'
    } else if (arg === '--force' || arg === '-f') args.force = true
    else if (arg === '--help' || arg === '-h') args.help = true
  }
  return args
}

function printHelp() {
  console.log(`
用法: npm run devtools:fetch -- [选项]

  --proxy <url>    指定代理，例如 http://127.0.0.1:7890
                   也支持 https:// 和 socks5://；写 auto 表示自动探测本机代理端口
                   写 none / off 表示强制直连
  --file <路径>    使用本地 .crx / .zip（推荐无代理时使用）
  --mirror <URL>   自定义下载源，URL 中的 {id} 会替换成扩展 ID
  --id <扩展ID>     指定扩展 ID（默认 Vue DevTools）
  --out <目录>     解包目标目录（默认 ./devtools-extension）
  --force          目标目录已存在时强制覆盖
  -h, --help       显示帮助

示例:
  npm run devtools:fetch -- --proxy http://127.0.0.1:7890
  npm run devtools:fetch --proxy socks5://127.0.0.1:7891
  npm run devtools:fetch --file ./vue-devtools.crx
`)
}
//#endregion

//#region 日志
const log = (...args) => console.log(...args)
const warn = (...args) => console.warn(...args)

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Node 的 AggregateError（happy eyeballs 超时）没有 message，这里兜底成可读文本 */
function errorText(error) {
  if (!error) return '未知错误'
  const message = String(error.message || '').trim()
  if (message) return message
  if (Array.isArray(error.errors) && error.errors.length) {
    const inner = error.errors.map(errorText).filter(Boolean)
    if (inner.length) return [...new Set(inner)].join(' / ')
  }
  const code = error.code || error.name
  const friendly = {
    ETIMEDOUT: '连接超时（可能被墙）',
    ENOTFOUND: '域名解析失败',
    ECONNREFUSED: '连接被拒绝',
    ECONNRESET: '连接被重置'
  }
  return friendly[code] || code || '未知错误'
}
//#endregion

//#region 代理解析
/** 把各种写法的代理地址规范成 { protocol, host, port, auth, raw } */
function parseProxy(raw) {
  if (!raw) return null
  let text = String(raw).trim()
  if (!text) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'http://' + text

  let url
  try {
    url = new URL(text)
  } catch (e) {
    return null
  }
  const protocol = (url.protocol || 'http:').toLowerCase()
  if (!/^(https?|socks[45]?):$/.test(protocol)) return null

  const defaultPort = protocol === 'https:' ? 443 : protocol.startsWith('socks') ? 1080 : 80
  const auth = url.username
    ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password || '')}`
    : null

  return {
    protocol,
    host: url.hostname,
    port: Number(url.port) || defaultPort,
    auth,
    raw: `${protocol}//${url.hostname}:${Number(url.port) || defaultPort}`,
    label: `${protocol}//${url.hostname}:${Number(url.port) || defaultPort}`
  }
}

/** 从 Windows 注册表读取系统代理（Clash / v2rayN 开「系统代理」时会写这里） */
function readWindowsSystemProxy() {
  if (process.platform !== 'win32') return null
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    const output = execFileSync('reg', ['query', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(output)
    if (!enabled) return null
    const serverMatch = output.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)
    if (!serverMatch) return null
    let server = serverMatch[1].trim()
    // 形如 "http=127.0.0.1:7890;https=127.0.0.1:7890" 或 "127.0.0.1:7890"
    if (server.includes('=')) {
      const map = {}
      for (const part of server.split(';')) {
        const [scheme, addr] = part.split('=')
        if (scheme && addr) map[scheme.trim().toLowerCase()] = addr.trim()
      }
      server = map.https || map.http || Object.values(map)[0]
    }
    if (!server) return null
    return parseProxy(server.includes('://') ? server : `http://${server}`)
  } catch (e) {
    return null
  }
}

/** 按优先级挑出一个代理配置；返回 { proxy, source } */
function resolveProxyFromEnvOrConfig() {
  const candidates = [
    ['npm_config_https_proxy', process.env.npm_config_https_proxy],
    ['npm_config_proxy', process.env.npm_config_proxy],
    ['HTTPS_PROXY', process.env.HTTPS_PROXY || process.env.https_proxy],
    ['HTTP_PROXY', process.env.HTTP_PROXY || process.env.http_proxy],
    ['ALL_PROXY', process.env.ALL_PROXY || process.env.all_proxy]
  ]
  for (const [source, value] of candidates) {
    const proxy = parseProxy(value)
    if (proxy) return { proxy, source }
  }
  const systemProxy = readWindowsSystemProxy()
  if (systemProxy) return { proxy: systemProxy, source: 'Windows 系统代理' }
  return { proxy: null, source: null }
}

/** 通过代理向目标发一次 CONNECT，成功即认为该端口是可用的 HTTP 代理 */
function openTunnel(proxy, host, port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (proxy.protocol.startsWith('socks')) {
      reject(new Error('内置下载器不支持 socks 代理，请改用 curl（本脚本会自动回退）'))
      return
    }
    const headers = { Host: `${host}:${port}`, 'Proxy-Connection': 'keep-alive' }
    if (proxy.auth) {
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64')
    }
    const mod = proxy.protocol === 'https:' ? https : http
    const req = mod.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers,
      timeout,
      agent: false,
      rejectUnauthorized: false
    })
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      req.destroy()
      reject(error)
    }
    req.once('connect', (res, socket) => {
      if (settled) {
        socket.destroy()
        return
      }
      if (res.statusCode !== 200) {
        socket.destroy()
        fail(new Error(`代理拒绝 CONNECT（HTTP ${res.statusCode}）`))
        return
      }
      settled = true
      resolve(socket)
    })
    req.once('timeout', () => fail(new Error(`连接代理 ${proxy.label} 超时`)))
    req.once('error', (error) => fail(error))
    req.end()
  })
}

/** 探测本机常见代理端口，返回第一个真正能连上 Google 的代理 */
async function detectLocalProxy(ports = LOCAL_PROXY_PORTS, timeout = 1800) {
  process.stdout.write(`探测本机代理端口（${ports.join(', ')}）... `)
  const attempts = ports.map((port) => {
    const proxy = parseProxy(`http://127.0.0.1:${port}`)
    return openTunnel(proxy, 'clients2.google.com', 443, timeout)
      .then((socket) => {
        socket.destroy()
        return proxy
      })
      .catch(() => null)
  })
  const results = await Promise.all(attempts)
  const hit = results.find(Boolean)
  log(hit ? `找到 ${hit.label}` : '未找到')
  return hit || null
}
//#endregion

//#region 下载
class TunnelAgent extends https.Agent {
  constructor(proxy, timeout) {
    super({ keepAlive: false })
    this.proxy = proxy
    this.timeout = timeout || 20000
  }

  createConnection(options, callback) {
    const host = options.host || options.hostname
    const port = Number(options.port) || 443
    openTunnel(this.proxy, host, port, this.timeout).then(
      (socket) => {
        // 走代理时放宽证书校验：很多本地代理会做中间人（Clash / v2ray 的 TLS 嗅探等）
        const secure = tls.connect({ socket, servername: host, rejectUnauthorized: false })
        const onError = (error) => {
          secure.destroy()
          callback(error)
        }
        secure.once('error', onError)
        secure.once('secureConnect', () => {
          secure.removeListener('error', onError)
          callback(null, secure)
        })
      },
      (error) => callback(error)
    )
  }
}

function rawRequest(urlObj, proxy, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === 'https:'
    const headers = { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'identity' }
    const requestPath = urlObj.pathname + urlObj.search

    let options
    if (proxy && !isHttps) {
      // 明文 HTTP 走代理：请求行用绝对地址
      headers.Host = urlObj.host
      if (proxy.auth) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64')
      options = { host: proxy.host, port: proxy.port, method: 'GET', path: urlObj.href, headers, timeout, agent: false }
    } else if (proxy) {
      options = {
        host: urlObj.hostname,
        port: Number(urlObj.port) || 443,
        method: 'GET',
        path: requestPath,
        headers,
        timeout,
        agent: new TunnelAgent(proxy, timeout)
      }
    } else {
      options = {
        host: urlObj.hostname,
        port: Number(urlObj.port) || (isHttps ? 443 : 80),
        method: 'GET',
        path: requestPath,
        headers,
        timeout,
        agent: false
      }
    }

    const mod = proxy && !isHttps ? http : isHttps ? https : http
    const req = mod.request(options)
    let settled = false
    req.once('response', (res) => {
      settled = true
      resolve(res)
    })
    req.once('timeout', () => req.destroy(new Error(`请求超时（${timeout / 1000}s）`)))
    req.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    req.end()
  })
}

function pipeToFile(res, dest) {
  return new Promise((resolve, reject) => {
    let size = 0
    const file = fs.createWriteStream(dest)
    res.on('data', (chunk) => {
      size += chunk.length
    })
    res.on('error', (error) => {
      file.destroy()
      reject(error)
    })
    file.on('error', reject)
    file.on('finish', () => file.close(() => resolve(size)))
    res.pipe(file)
  })
}

/** Node 原生下载：支持代理隧道 + 跟随重定向 */
async function downloadWithNode(url, dest, proxy, maxRedirects = 6) {
  let current = new URL(url)
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await rawRequest(current, proxy)
    const status = res.statusCode || 0

    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      res.resume()
      current = new URL(res.headers.location, current)
      continue
    }
    if (status !== 200) {
      res.resume()
      throw new Error(`HTTP ${status}`)
    }
    const size = await pipeToFile(res, dest)
    if (!size) throw new Error('下载结果为空')
    return size
  }
  throw new Error('重定向次数过多')
}

let curlAvailable = null

function hasCurl() {
  if (curlAvailable !== null) return curlAvailable
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' })
    curlAvailable = true
  } catch (e) {
    curlAvailable = false
  }
  return curlAvailable
}

/** curl 兜底（也能处理 socks 代理） */
function downloadWithCurl(url, dest, proxy, timeout = 90) {
  const args = ['-sS', '-L', '--fail', '--max-time', String(timeout), '-A', UA, '-o', dest, url]
  if (proxy) args.unshift('--proxy', proxy.raw)
  else args.unshift('--noproxy', '*')

  try {
    execFileSync('curl', args, { stdio: 'ignore' })
  } catch (error) {
    const code = error.status
    if (code === 7) throw new Error('curl: 连不上服务器 / 代理')
    if (code === 22) throw new Error('curl: 服务器返回 4xx/5xx（该下载源不可用或被墙）')
    if (code === 28) throw new Error('curl: 请求超时')
    if (code === 35) throw new Error('curl: TLS 握手失败（代理可能不支持 HTTPS 隧道）')
    throw new Error(`curl 执行失败（exit ${code === undefined ? '?' : code}）`)
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    throw new Error('下载结果为空')
  }
  return fs.statSync(dest).size
}

/**
 * 单个下载源：先用 Node（支持代理隧道）再用 curl 兜底。
 * 每次都把失败原因收集起来，最后一次性说明，避免「只有一个 exit 22」的黑箱。
 */
async function download(url, dest) {
  const errors = []
  const engines = [['Node', () => downloadWithNode(url, dest, currentProxy)]]

  if (hasCurl()) {
    engines.push(['curl', () => downloadWithCurl(url, dest, currentProxy)])
  }

  for (const [name, run] of engines) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { force: true })
    try {
      const size = await run()
      return { engine: name, size }
    } catch (error) {
      errors.push(`${name}: ${errorText(error)}`)
    }
  }
  throw new Error(errors.join('；'))
}

/** 检查下下来的东西到底是扩展包还是错误页 */
function looksLikeExtension(buffer) {
  if (!buffer || buffer.length < 4) return false
  if (buffer.toString('ascii', 0, 4) === 'Cr24') return true
  return buffer.readUInt32LE(0) === 0x04034b50 // PK\x03\x04
}
//#endregion

//#region CRX / ZIP 解包（纯 Node 实现，无第三方依赖）
/** CRX3 头部格式：Cr24 + version(4) + headerSize(4) + header + zip */
function stripCrxHeader(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'Cr24') {
    return buffer // 本身已经是 zip
  }
  const version = buffer.readUInt32LE(4)
  if (version === 2) {
    const publicKeyLength = buffer.readUInt32LE(8)
    const signatureLength = buffer.readUInt32LE(12)
    return buffer.slice(16 + publicKeyLength + signatureLength)
  }
  const headerSize = buffer.readUInt32LE(8)
  return buffer.slice(12 + headerSize)
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset
    }
  }
  return -1
}

function safeJoin(root, entryName) {
  const normalized = entryName.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.includes('../')) {
    return null
  }
  const target = path.join(root, normalized)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  return target.startsWith(rootWithSep) ? target : null
}

function extractZip(zipBuffer, outDir) {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer)
  if (eocdOffset < 0) {
    throw new Error('不是合法的 ZIP/CRX 文件（找不到目录结尾标记）')
  }
  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10)
  let pointer = zipBuffer.readUInt32LE(eocdOffset + 16)
  let extracted = 0

  for (let i = 0; i < entryCount; i++) {
    if (zipBuffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('ZIP 中央目录损坏')
    }
    const method = zipBuffer.readUInt16LE(pointer + 10)
    const compressedSize = zipBuffer.readUInt32LE(pointer + 20)
    const nameLength = zipBuffer.readUInt16LE(pointer + 28)
    const extraLength = zipBuffer.readUInt16LE(pointer + 30)
    const commentLength = zipBuffer.readUInt16LE(pointer + 32)
    const localHeaderOffset = zipBuffer.readUInt32LE(pointer + 42)
    const entryName = zipBuffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    pointer += 46 + nameLength + extraLength + commentLength

    if (entryName.startsWith('__MACOSX')) {
      continue
    }
    const targetPath = safeJoin(outDir, entryName)
    if (!targetPath) {
      continue
    }
    if (entryName.endsWith('/')) {
      fs.mkdirSync(targetPath, { recursive: true })
      continue
    }

    const localNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const raw = zipBuffer.slice(dataStart, dataStart + compressedSize)

    let content
    if (method === 0) {
      content = raw
    } else if (method === 8) {
      content = zlib.inflateRawSync(raw)
    } else {
      warn(`  ! 跳过不支持压缩方式的文件: ${entryName}`)
      continue
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, content)
    extracted++
  }
  return extracted
}
//#endregion

function readElectronMajorVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'node_modules/electron/package.json'), 'utf8'))
    return Number.parseInt(String(pkg.version).split('.')[0], 10)
  } catch (e) {
    return null
  }
}

function reportManifest(outDir) {
  const manifestPath = path.join(outDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    warn('! 解包完成但没找到 manifest.json，请检查文件是否完整。')
    return
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    warn('! manifest.json 解析失败:', e.message)
    return
  }
  log(`  扩展名称: ${manifest.name}`)
  log(`  扩展版本: ${manifest.version}`)
  log(`  Manifest: V${manifest.manifest_version}`)

  const electronMajor = readElectronMajorVersion()
  if (manifest.manifest_version === 3 && electronMajor !== null && electronMajor < 22) {
    warn(`
! 注意：Manifest V3 扩展需要 Electron 22+，当前项目是 Electron ${electronMajor}。
  即使解包成功，Electron 13 也加载不了它（loadExtension 会报错）。
  在 Electron 13 下可用的 Vue DevTools 只有 5.3.x（仅支持 Vue 2），
  所以本项目默认跳过 DevTools 加载，不影响开发。
`)
  }
}

//#region 下载流程
let currentProxy = null

function describeProxy() {
  if (!currentProxy) return '直连'
  return `代理 ${currentProxy.label}`
}

/** 有代理时先试 Chrome 商店（走代理最稳），纯直连时先试 Edge 商店（国内可能更容易通） */
function orderSources() {
  const chrome = DOWNLOAD_SOURCES.find((source) => source.name === 'Chrome 商店')
  const edge = DOWNLOAD_SOURCES.find((source) => source.name === 'Edge 商店')
  return currentProxy ? [chrome, edge] : [edge, chrome]
}

async function fetchSources(sources, tmpFile) {
  const errors = []
  for (const source of sources) {
    const url = source.url.replace(/\{id\}/g, encodeURIComponent(source.id))
    process.stdout.write(`尝试下载（${source.name}，${describeProxy()}）... `)
    try {
      const { engine, size } = await download(url, tmpFile)
      log(`成功（${engine}，${formatBytes(size)}）`)
      return
    } catch (error) {
      log(`失败: ${error.message}`)
      errors.push(`${source.name}: ${error.message}`)
    }
  }
  const error = new Error(`所有下载源都失败了\n  - ${errors.join('\n  - ')}`)
  error.allFailed = true
  throw error
}
//#endregion

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const outDir = args.out
  if (fs.existsSync(path.join(outDir, 'manifest.json')) && !args.force) {
    log(`已存在解包好的扩展: ${outDir}`)
    log('如需重新下载，加 --force 参数。')
    return
  }

  const requested = args.proxy === undefined ? undefined : String(args.proxy).toLowerCase()
  const forcedDirect = requested === 'none' || requested === 'off' || requested === 'direct'
  const forceAuto = requested === 'auto'

  if (args.proxy && !forcedDirect && !forceAuto) {
    currentProxy = parseProxy(args.proxy)
    if (!currentProxy) {
      throw new Error(`--proxy 参数无法识别: ${args.proxy}（示例: http://127.0.0.1:7890）`)
    }
    log(`使用命令行指定的${describeProxy()}`)
  } else if (forcedDirect) {
    log('已按参数要求强制直连')
  }

  // --proxy auto：明确要求「自己找代理」，所以先扫本机端口，扫不到再看环境变量
  if (forceAuto && !forcedDirect) {
    currentProxy = await detectLocalProxy()
    if (!currentProxy) {
      const { proxy, source } = resolveProxyFromEnvOrConfig()
      if (proxy) {
        currentProxy = proxy
        log(`本机端口没扫到代理，改用${source}：${describeProxy()}`)
      } else {
        warn('自动探测没有找到可用代理，将按直连尝试。')
      }
    }
  }

  if (!currentProxy && !forcedDirect) {
    const { proxy, source } = resolveProxyFromEnvOrConfig()
    if (proxy) {
      currentProxy = proxy
      log(`检测到${source}，使用${describeProxy()}`)
    }
  }

  const tmpFile = path.join(os.tmpdir(), `vue-devtools-${Date.now()}.crx`)
  try {
    if (args.file) {
      const filePath = path.resolve(args.file)
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`)
      }
      log(`使用本地文件: ${filePath}`)
      fs.copyFileSync(filePath, tmpFile)
    } else {
      const sources = args.mirror
        ? [{ name: '自定义镜像', id: args.id || CHROME_ID, url: args.mirror }]
        : orderSources()

      try {
        await fetchSources(sources, tmpFile)
      } catch (error) {
        // 直连全军覆没时，再自动扫一遍本机代理端口重试一次
        const canAutoRetry = !currentProxy && !forcedDirect && !args.mirror
        if (!canAutoRetry) throw error

        const detected = await detectLocalProxy()
        if (!detected) {
          throw error
        }
        currentProxy = detected
        log(`改用${describeProxy()} 重试`)
        await fetchSources(orderSources(), tmpFile)
      }
    }

    const buffer = fs.readFileSync(tmpFile)
    if (!looksLikeExtension(buffer)) {
      const preview = buffer.slice(0, 200).toString('utf8').replace(/\s+/g, ' ').trim()
      throw new Error(`下载到的内容不是扩展包（可能是错误页/登录页）: ${preview}`)
    }

    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
    fs.mkdirSync(outDir, { recursive: true })

    const extracted = extractZip(stripCrxHeader(buffer), outDir)
    log(`\n解包完成: ${outDir}（${extracted} 个文件）`)
    reportManifest(outDir)
    log('\n现在 npm run electron:serve 会自动加载这个本地扩展，不再联网下载。')
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile, { force: true })
    }
  }
}

main().catch((error) => {
  console.error(`\n失败: ${error.message}`)
  console.error(`
怎么解决：
  1) 有代理软件（Clash / v2rayN / Shadowsocks）的话，直接指定端口：
       npm run devtools:fetch -- --proxy http://127.0.0.1:7890
     或者让它自己找：
       npm run devtools:fetch -- --proxy auto
  2) 没有代理，就用浏览器打开扩展商店下载 .crx 到本地，再离线解包：
       https://microsoftedge.microsoft.com/addons/detail/${EDGE_ID}
       npm run devtools:fetch -- --file ./你的文件.crx
  3) 什么都没做也没关系：electron:serve 检测不到扩展会静默跳过，不影响开发。
`)
  process.exit(1)
})
