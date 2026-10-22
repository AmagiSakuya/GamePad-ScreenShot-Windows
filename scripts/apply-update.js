'use strict'

/**
 * 热更新落地助手（独立进程，不在 Electron 里跑）
 *
 * 调用方式（由主进程 spawn）：
 *   ELECTRON_RUN_AS_NODE=1 "<app.exe>" apply-update.js --plan <resources>/.update-staging/plan.json
 *
 * 为什么需要它：
 *   运行中的应用把 app.asar 映射着，JavaScript 覆盖不了。
 *   所以由这个「纯 Node」进程等应用真正退出后，再替换文件并重新拉起应用。
 *
 * 安全策略：
 *   每个文件先校验 sha256，再「备份 → 覆盖」，任何一步失败都整体回滚，
 *   保证不会出现「app.asar 换了一半」导致应用打不开的情况。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

/**
 * 这个进程虽然是 ELECTRON_RUN_AS_NODE 起的纯 Node，但可执行文件仍是 Electron，
 * 一旦 asar 支持生效，`fs.statSync('...app.asar')` 会被当成「打开一个 asar 包」，
 * 对刚写入、还没被 Electron 校验过的文件就会报 Invalid package。
 * 助手全程只跟真实文件打交道，直接关掉。
 */
process.noAsar = true

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    args[key] = value
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const planPath = args.plan

let logPath = args.log || ''
function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    if (!logPath) return
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, line, 'utf8')
  } catch (error) { /* 日志失败不影响主流程 */ }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** 等应用进程彻底退出，最多 60 秒 */
async function waitForExit(pid) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await sleep(250)
  }
  return !isProcessAlive(pid)
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function moveIntoPlace(source, target) {
  // 同一卷内 rename 最快，跨卷（或目标被占用）时退回复制
  try {
    await fs.promises.rename(source, target)
  } catch (error) {
    await fs.promises.copyFile(source, target)
    await fs.promises.rm(source, { force: true })
  }
}

async function forceRemove(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.promises.rm(target, { force: true, recursive: true })
      return true
    } catch (error) {
      await sleep(300)
    }
  }
  return false
}

async function main() {
  if (!planPath) {
    writeLog('缺少 --plan 参数')
    process.exit(2)
  }

  let plan
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  } catch (error) {
    writeLog(`读取更新计划失败: ${error.message}`)
    process.exit(3)
  }

  logPath = logPath || plan.logFile
  writeLog(`开始应用更新 v${plan.version}，等待进程 ${plan.pid} 退出`)

  const exited = await waitForExit(plan.pid)
  if (!exited) {
    // 旧实例还活着：新实例大概会被单实例锁挡掉，这里只当作「唤起」兜底
    writeLog('等待应用退出超时，放弃本次更新')
    await restartApp(plan)
    process.exit(4)
  }

  const resourcesDir = plan.resourcesDir
  const applied = []

  const rollback = async () => {
    for (const item of applied.reverse()) {
      try {
        if (item.backup && fs.existsSync(item.backup)) {
          await fs.promises.rm(item.target, { force: true })
          await fs.promises.rename(item.backup, item.target)
          writeLog(`已回滚 ${item.target}`)
        } else if (item.created && fs.existsSync(item.target)) {
          await fs.promises.rm(item.target, { force: true })
          writeLog(`已移除新增文件 ${item.target}`)
        }
      } catch (error) {
        writeLog(`回滚 ${item.target} 失败: ${error.message}`)
      }
    }
  }

  try {
    // 1. 校验所有待替换文件
    for (const file of plan.files) {
      if (!fs.existsSync(file.staged)) {
        throw new Error(`暂存文件缺失: ${file.path}`)
      }
      if (file.sha256) {
        const actual = await sha256File(file.staged)
        if (actual !== String(file.sha256).toLowerCase()) {
          throw new Error(`${file.path} 校验失败`)
        }
      }
    }

    // 2. 逐个替换（先备份再写入）
    for (const file of plan.files) {
      const target = path.join(resourcesDir, file.path)
      const backup = `${target}.old`
      await fs.promises.mkdir(path.dirname(target), { recursive: true })

      const exists = fs.existsSync(target)
      if (exists) {
        await forceRemove(backup)
        await fs.promises.rename(target, backup)
        applied.push({ target, backup, created: false })
      } else {
        applied.push({ target, backup: '', created: true })
      }

      await moveIntoPlace(file.staged, target)
      writeLog(`已更新 ${file.path}`)
    }

    // 3. 删除清单里标记为移除的文件
    for (const relative of plan.remove || []) {
      const target = path.join(resourcesDir, relative)
      if (fs.existsSync(target)) {
        await forceRemove(target)
        writeLog(`已删除 ${relative}`)
      }
    }
  } catch (error) {
    writeLog(`更新失败: ${error.message}`)
    await rollback()
    await restartApp(plan)
    process.exit(5)
  }

  // 4. 清理：备份文件删不掉就留给下次启动清理
  for (const item of applied) {
    if (item.backup) await forceRemove(item.backup)
  }
  await forceRemove(plan.stagingDir)

  writeLog(`更新到 v${plan.version} 完成，准备重启`)
  await restartApp(plan)
  process.exit(0)
}

/**
 * 重新拉起应用。
 *
 * 这里最容易踩的坑：**不能原样把本进程的环境变量交给新实例**。
 *
 * 助手自己是被主进程用 ELECTRON_RUN_AS_NODE=1 拉起来的（只有这样它才是一个纯
 * Node 进程，能绕开 asar 去覆盖 app.asar），而 spawn 默认继承 process.env。
 * 一旦把这个开关一起传下去，重新拉起的「应用」会继续以 Node 模式启动：
 *   - 不加载 app.asar，不创建 BrowserWindow；
 *   - stdio 是 'ignore'，stdin 指向 NUL，Node 读到 EOF 就立刻退出。
 * 结果就是更新在几十毫秒里「静默跑完并消失」，用户完全看不到界面，只能自己
 * 再双击一次图标 —— 而文件早就换好了，所以那时看到的是新版本。
 *
 * 所以要把 Electron 的启动开关摘掉，其余环境变量（PATH / APPDATA / 代理等）照常继承。
 */
const SPAWN_ENV_DROPS = ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ASAR']

async function restartApp(plan) {
  const exe = plan.restart
  if (!exe || !fs.existsSync(exe)) {
    writeLog(`找不到可执行文件，跳过自动重启: ${exe}`)
    return false
  }

  const env = { ...process.env }
  for (const key of SPAWN_ENV_DROPS) delete env[key]

  try {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exe),
      env
    })

    let earlyExit = null
    child.on('error', (error) => writeLog(`重启失败: ${error.message}`))
    child.on('exit', (code, signal) => {
      earlyExit = `code=${code} signal=${signal}`
    })
    child.unref()
    writeLog(`已重新拉起应用 (pid ${child.pid})`)

    // 留一个观察窗口：正常启动的应用会一直活着，1.5 秒内就退出说明这次重启
    // 没成功（缺文件、单实例锁被旧进程占着等）。写进日志，不用再靠猜。
    await sleep(1500)
    if (earlyExit) writeLog(`新实例提前退出（${earlyExit}），请检查是否被单实例锁挡住或启动失败`)
    return !earlyExit
  } catch (error) {
    writeLog(`重启失败: ${error.message}`)
    return false
  }
}

main().catch((error) => {
  writeLog(`未捕获异常: ${error && error.stack ? error.stack : error}`)
  process.exit(1)
})
