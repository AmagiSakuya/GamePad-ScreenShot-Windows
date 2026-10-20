/**
 * 键盘输出通道：通过一个常驻的 PowerShell 子进程调用 Win32 keybd_event 发送按键。
 *
 * 为什么不用 JS 库：
 * - 项目里只有 uiohook-napi（听键，不能发键），没有 robotjs / ffi 这类需要编译的原生模块；
 * - 引入新的原生依赖要跟随 Electron 版本重编，风险高。
 * PowerShell + keybd_event 是系统自带能力，零依赖，且能发送 Win 键 / 多媒体键，
 * 并支持扩展键标记（方向键、右 Alt 等），覆盖手柄映射的常见需求。
 *
 * 代价：常驻一个 PowerShell 进程（约 25MB），首次启动需要 ~0.5s 编译 Add-Type。
 * 因此做成「按需启动 + 之后常驻」，只在用户启用映射或点测试时才会拉起。
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// 脚本内容变更时递增，旧脚本会被覆盖重写
const SCRIPT_VERSION = 3

const PS_SCRIPT = `$ErrorActionPreference = 'Stop'
$ok = $true
try {
  Add-Type -Namespace GpMap -Name Kb -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint MapVirtualKey(uint uCode, uint uMapType);
"@
} catch {
  $ok = $false
}
[Console]::Out.WriteLine('READY:' + $ok)
[Console]::Out.Flush()
if (-not $ok) { exit 1 }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'quit') { break }
  $seg = $line.Split('|')
  if ($seg.Length -lt 2) { continue }
  $cmd = $seg[0]
  $codes = @()
  for ($i = 1; $i -lt $seg.Length; $i++) {
    if ([string]::IsNullOrWhiteSpace($seg[$i])) { continue }
    $p = $seg[$i].Split(':')
    $vk = [byte][Convert]::ToInt32($p[0], 16)
    $ext = ($p.Length -gt 1 -and $p[1] -eq '1')
    $scan = [byte]([GpMap.Kb]::MapVirtualKey([uint32]$vk, 0))
    $codes += ,@($vk, $scan, $ext)
  }
  if ($cmd -eq 'd') {
    foreach ($c in $codes) {
      $flags = 0
      if ($c[2]) { $flags = 1 }
      [GpMap.Kb]::keybd_event($c[0], $c[1], [uint32]$flags, [System.UIntPtr]::Zero)
    }
  } elseif ($cmd -eq 'u') {
    foreach ($c in $codes) {
      $flags = 2
      if ($c[2]) { $flags = 3 }
      [GpMap.Kb]::keybd_event($c[0], $c[1], [uint32]$flags, [System.UIntPtr]::Zero)
    }
  }
}
`

function createKeySender({ app, log, scriptDir }) {
  let child = null
  let status = 'idle' // idle | starting | ready | failed
  let lastError = ''
  let pending = []
  let disposed = false
  let scriptPath = ''

  function resolveScriptPath() {
    const baseDir = scriptDir || app.getPath('userData')
    return path.join(baseDir, `key-sender-v${SCRIPT_VERSION}.ps1`)
  }

  function ensureScript() {
    const target = resolveScriptPath()
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, PS_SCRIPT, { encoding: 'ascii' })
      scriptPath = target
      return true
    } catch (error) {
      lastError = `write script failed: ${error.message}`
      log.error('[MAPPING] Failed to write key sender script:', error)
      return false
    }
  }

  function flushPending() {
    if (status !== 'ready' || !pending.length) return
    const list = pending
    pending = []
    for (const line of list) write(line)
  }

  function write(line) {
    if (!child || child.killed || !child.stdin || child.stdin.destroyed) return false
    try {
      child.stdin.write(line + '\n')
      return true
    } catch (error) {
      lastError = error.message
      log.warn('[MAPPING] Failed to write to key sender:', error.message)
      return false
    }
  }

  function start() {
    if (disposed) return false
    if (status === 'ready' || status === 'starting') return true
    if (process.platform !== 'win32') {
      status = 'failed'
      lastError = 'unsupported platform'
      return false
    }
    if (!ensureScript()) {
      status = 'failed'
      return false
    }

    status = 'starting'
    lastError = ''

    try {
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      status = 'failed'
      lastError = error.message
      log.error('[MAPPING] Failed to spawn key sender:', error)
      return false
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      if (text.indexOf('READY:True') !== -1) {
        status = 'ready'
        lastError = ''
        flushPending()
      } else if (text.indexOf('READY:False') !== -1) {
        status = 'failed'
        lastError = 'Add-Type failed'
        log.error('[MAPPING] Key sender failed to compile Win32 bindings')
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) {
        lastError = text
        log.warn('[MAPPING] Key sender stderr:', text)
      }
    })

    child.on('error', (error) => {
      status = 'failed'
      lastError = error.message
      log.error('[MAPPING] Key sender process error:', error)
    })

    child.on('exit', (code) => {
      child = null
      if (disposed) return
      if (status === 'ready' || status === 'starting') {
        status = 'failed'
        lastError = `key sender exited with code ${code}`
        log.warn('[MAPPING] Key sender exited unexpectedly:', code)
      }
    })

    return true
  }

  /** 把 [{vk, ext}] 编码成一行协议文本 */
  function encode(cmd, keys) {
    const parts = [cmd]
    for (const key of keys) {
      parts.push(key.vk.toString(16).toUpperCase().padStart(2, '0') + ':' + (key.ext ? '1' : '0'))
    }
    return parts.join('|')
  }

  function send(cmd, keys) {
    if (!keys || !keys.length) return false
    if (status !== 'ready') {
      start()
      // 未就绪时先排队，等 READY 后再发（避免丢掉刚启用时的第一次按键）
      if (pending.length < 32) pending.push(encode(cmd, keys))
      return status !== 'failed'
    }
    return write(encode(cmd, keys))
  }

  return {
    start,
    down(keys) {
      return send('d', keys)
    },
    up(keys) {
      return send('u', keys)
    },
    /** 完整敲击一次：按下 → holdMs 后松开（松开顺序与按下相反） */
    tap(keys, holdMs = 24) {
      if (!keys || !keys.length) return false
      const ok = this.down(keys)
      const reversed = keys.slice().reverse()
      setTimeout(() => this.up(reversed), Math.max(8, holdMs))
      return ok
    },
    getStatus() {
      return { status, error: lastError }
    },
    dispose() {
      disposed = true
      pending = []
      if (child) {
        try {
          child.stdin.write('quit\n')
        } catch (error) {
          // ignore
        }
        const target = child
        setTimeout(() => {
          try {
            target.kill()
          } catch (error) {
            // ignore
          }
        }, 300)
        child = null
      }
      status = 'idle'
    }
  }
}

module.exports = { createKeySender }
