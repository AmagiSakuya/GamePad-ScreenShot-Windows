'use strict'

/**
 * 窗口来源枚举（供「截图来源 → 窗口」下拉框使用）。
 *
 * 为什么不用 active-win 的 getOpenWindows：
 * 它内部的过滤器要求窗口带标题栏 —— `(dwStyle & WS_CAPTION) === WS_CAPTION`
 * （见 active-win Sources/windows/main.cc 的 EnumDekstopWindowsProc）。
 * 而无边框 / 独占全屏的游戏是 WS_POPUP（style 形如 0x94000000，没有 WS_CAPTION），
 * 会被整条丢掉，表现就是「游戏明明在运行，下拉框里却找不到」。
 *
 * node-screenshots 按 HWND 枚举顶层窗口，不要求标题栏；而且真正的截取
 * （ScreenshotWindow.all() + captureImage）用的是同一套 id，
 * 所以「下拉框里列出来的窗口」和「能截到的窗口」天然一致。
 */

const log = require('electron-log')
const { Window: ScreenshotWindow, Monitor: ScreenshotMonitor } = require('node-screenshots')

// node-screenshots 的字段是原型上的 getter（个别版本暴露成方法），统一读一次
function readWindowField(item, key) {
    const value = item ? item[key] : undefined
    return typeof value === 'function' ? value.call(item) : value
}

/**
 * 显示器列表（像素尺寸是物理像素，不是 DIP）。
 *
 * 用它而不是 Electron 的 `screen`：窗口对象的 `currentMonitor` 就是同一套对象，
 * 所以「窗口落在哪块屏、这块屏的 scaleFactor 是多少」能一次问清楚，
 * 不用在两套 API 之间换算 DIP 坐标。
 *
 * @returns {Array<{index:number,id:number,name:string,width:number,height:number,
 *                  scaleFactor:number,primary:boolean}>}
 */
function listCaptureMonitors() {
    if (!ScreenshotMonitor || typeof ScreenshotMonitor.all !== 'function') return []
    return (ScreenshotMonitor.all() || []).map((item, index) => ({
        index,
        id: readWindowField(item, 'id'),
        name: String(readWindowField(item, 'name') || ''),
        width: Number(readWindowField(item, 'width')) || 0,
        height: Number(readWindowField(item, 'height')) || 0,
        scaleFactor: Number(readWindowField(item, 'scaleFactor')) || 1,
        primary: !!readWindowField(item, 'isPrimary')
    }))
}

/**
 * @returns {Array<{id:number,title:string,ownerName:string,processId:number,path:string,
 *                  bounds:{x:number,y:number,width:number,height:number},minimized:boolean}>}
 */
function listCaptureWindows() {
    if (!ScreenshotWindow || typeof ScreenshotWindow.all !== 'function') {
        return []
    }

    return (ScreenshotWindow.all() || [])
        .map((item) => {
            const id = readWindowField(item, 'id')
            const title = String(readWindowField(item, 'title') || '').trim()
            const appName = String(readWindowField(item, 'appName') || '').trim()
            return {
                id,
                title,
                // appName 与 title 撞名时（游戏很常见）不加前缀，否则标签会变成「X - X」
                ownerName: appName && appName !== title ? appName : '',
                processId: 0,
                path: '',
                bounds: {
                    x: Number(readWindowField(item, 'x')) || 0,
                    y: Number(readWindowField(item, 'y')) || 0,
                    width: Number(readWindowField(item, 'width')) || 0,
                    height: Number(readWindowField(item, 'height')) || 0
                },
                minimized: !!readWindowField(item, 'isMinimized'),
                // 窗口矩形是 DIP，WGC（gfxcapture）抓出来的是物理像素，
                // 两者差一个系统缩放（150% 时 1684×1092 → 2526×1638）
                scaleFactor: (() => {
                    const monitor = readWindowField(item, 'currentMonitor')
                    return Number(monitor && readWindowField(monitor, 'scaleFactor')) || 1
                })()
            }
        })
        .filter((item) => item.id && item.title)
        .filter((item) => item.bounds.width > 0 && item.bounds.height > 0)
        .filter((item) => !item.minimized)
}

// 兜底：node-screenshots 枚举失败时退回 active-win（只覆盖带标题栏的窗口）
async function listCaptureWindowsFallback() {
    const activeWin = require('active-win')
    if (process.platform !== 'win32' || typeof activeWin.getOpenWindows !== 'function') {
        return []
    }

    const windows = await activeWin.getOpenWindows()
    return windows
        .filter((item) => item && item.id && item.title && item.bounds)
        .filter((item) => item.bounds.width > 0 && item.bounds.height > 0)
        .filter((item) => item.bounds.x > -10000 && item.bounds.y > -10000)
        .map((item) => ({
            id: item.id,
            title: item.title,
            ownerName: item.owner && item.owner.name ? item.owner.name : '',
            processId: item.owner && item.owner.processId ? item.owner.processId : 0,
            path: item.owner && item.owner.path ? item.owner.path : '',
            bounds: item.bounds,
            minimized: false
        }))
}

async function enumerateCaptureWindows() {
    try {
        const windows = listCaptureWindows()
        if (windows.length) return windows
    } catch (error) {
        log.warn('Enumerate capture windows failed:', error)
    }

    try {
        return await listCaptureWindowsFallback()
    } catch (error) {
        log.warn('Fallback window enumeration failed:', error)
        return []
    }
}

module.exports = {
    listCaptureWindows,
    listCaptureWindowsFallback,
    listCaptureMonitors,
    enumerateCaptureWindows
}
