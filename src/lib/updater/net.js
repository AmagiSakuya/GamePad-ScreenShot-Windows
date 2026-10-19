'use strict'

/**
 * 更新模块用的 HTTP 工具
 *
 * 相比原来直接用 https.request 的地方，这里补了三件事：
 * 1. 真正的 HTTP 代理支持（CONNECT 隧道）——原来只是写了 process.env.HTTPS_PROXY，
 *    Node 的 https.request 并不会读它，所以设置里的代理其实一直没生效。
 * 2. 自动跟随 302（GitHub Release 会跳转到 objects.githubusercontent.com）。
 * 3. 下载时边写盘边算 sha256，配合清单做完整性校验。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const tls = require('tls')
const crypto = require('crypto')

const USER_AGENT = 'GamePad-ScreenShot-Updater'
const MAX_REDIRECTS = 8

const agentCache = new Map()

/** https 的 CONNECT 隧道代理 */
class HttpsProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: false, maxSockets: 6 })
    this.proxyUrl = proxyUrl
  }

  createConnection(options, callback) {
    let proxy
    try {
      proxy = new URL(this.proxyUrl)
    } catch (error) {
      callback(error)
      return
    }

    const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80)
    const targetHost = options.host
    const targetPort = Number(options.port) || 443
    const transport = proxy.protocol === 'https:' ? https : http

    const headers = { Host: `${targetHost}:${targetPort}` }
    if (proxy.username) {
      const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`
    }

    const connectReq = transport.request({
      host: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers,
      timeout: 15000
    })

    connectReq.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        callback(new Error(`代理 CONNECT 失败: HTTP ${res.statusCode}`))
        return
      }
      const tlsSocket = tls.connect({
        socket,
        servername: options.servername || targetHost,
        rejectUnauthorized: options.rejectUnauthorized !== false
      })
      tlsSocket.once('secureConnect', () => callback(null, tlsSocket))
      tlsSocket.once('error', (error) => callback(error))
    })
    connectReq.once('timeout', () => connectReq.destroy(new Error('代理连接超时')))
    connectReq.once('error', (error) => callback(error))
    connectReq.end()
  }
}

/** 支持 `127.0.0.1:7890`、`http://user:pass@host:port` 两种写法 */
function normalizeProxy(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw
  return `http://${raw}`
}

function getAgent(proxy) {
  if (!proxy) return undefined
  if (!agentCache.has(proxy)) agentCache.set(proxy, new HttpsProxyAgent(proxy))
  return agentCache.get(proxy)
}

/**
 * 发起 GET 请求并自动跟随重定向。
 * 成功时 resolve `{ res, req }`（res 是未消费的响应流），失败 reject。
 */
function openRequest(url, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let target
    try {
      target = new URL(url)
    } catch (error) {
      reject(new Error(`无效链接: ${url}`))
      return
    }

    const isHttp = target.protocol === 'http:'
    const transport = isHttp ? http : https
    const requestOptions = {
      method: 'GET',
      hostname: target.hostname,
      port: target.port || (isHttp ? 80 : 443),
      path: `${target.pathname}${target.search}`,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'identity',
        ...(options.headers || {})
      }
    }
    if (!isHttp && options.proxy) requestOptions.agent = getAgent(options.proxy)

    const req = transport.request(requestOptions, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('重定向次数过多'))
          return
        }
        let nextUrl
        try {
          nextUrl = new URL(res.headers.location, url).toString()
        } catch (error) {
          reject(new Error('重定向地址无效'))
          return
        }
        resolve(openRequest(nextUrl, options, redirects + 1))
        return
      }
      if (status !== 200) {
        res.resume()
        const error = new Error(`HTTP ${status}`)
        error.statusCode = status
        reject(error)
        return
      }
      resolve({ res, req })
    })

    if (options.cancelToken) {
      // 取消信号：直接销毁连接，onError 会 reject
      options.cancelToken.register(() => req.destroy(new Error('已取消')))
    }

    req.setTimeout(Number(options.timeout) || 20000, () => req.destroy(new Error('连接超时')))
    req.once('error', reject)
    req.end()
  })
}

/** 拉取 JSON（体积上限 4MB，防止被镜像站的错误页撑爆） */
async function fetchJson(url, options = {}) {
  const { res, req } = await openRequest(url, {
    proxy: options.proxy,
    timeout: options.timeout || 10000,
    cancelToken: options.cancelToken,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  })

  const chunks = []
  let size = 0
  try {
    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > 4 * 1024 * 1024) {
          res.destroy()
          reject(new Error('响应内容过大'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', resolve)
      res.on('error', reject)
    })
  } finally {
    if (!res.complete) req.destroy()
  }

  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('返回内容不是合法 JSON')
  }
}

/**
 * 下载到本地文件，返回 `{ size, sha256 }`。
 * 先写 `.part` 再改名，避免中断留下半截文件被当成有效包。
 */
async function downloadFile(url, dest, options = {}) {
  const { res, req } = await openRequest(url, {
    proxy: options.proxy,
    timeout: options.timeout || 25000,
    cancelToken: options.cancelToken,
    headers: { Accept: '*/*' }
  })

  const expectedSize = Number(options.expectedSize) || 0
  const total = Number(res.headers['content-length']) || expectedSize || 0
  const hash = crypto.createHash('sha256')
  const tempPath = `${dest}.part`

  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  const stream = fs.createWriteStream(tempPath)
  let received = 0

  try {
    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        received += chunk.length
        hash.update(chunk)
        if (typeof options.onProgress === 'function') {
          options.onProgress(received, total)
        }
      })
      res.on('error', reject)
      stream.on('error', reject)
      stream.on('finish', resolve)
      res.pipe(stream)
    })
  } catch (error) {
    stream.destroy()
    req.destroy()
    await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  if (expectedSize && received !== expectedSize) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    throw new Error(`文件大小不一致（期望 ${expectedSize}，实际 ${received}）`)
  }

  await fs.promises.rename(tempPath, dest)
  return { size: received, sha256: hash.digest('hex') }
}

/** 简单的取消令牌：主进程收到「取消」时统一触发 */
function createCancelToken() {
  let cancelled = false
  const listeners = new Set()
  return {
    get cancelled() {
      return cancelled
    },
    cancel() {
      if (cancelled) return
      cancelled = true
      for (const listener of listeners) {
        try {
          listener()
        } catch (error) { /* ignore */ }
      }
      listeners.clear()
    },
    register(listener) {
      if (cancelled) {
        listener()
        return
      }
      listeners.add(listener)
    },
    throwIfCancelled() {
      if (cancelled) throw new Error('已取消')
    }
  }
}

module.exports = {
  normalizeProxy,
  fetchJson,
  downloadFile,
  createCancelToken,
  openRequest
}
