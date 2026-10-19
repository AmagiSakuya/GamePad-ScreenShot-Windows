/**
 * 跨进程传参必须先是「纯数据」。
 *
 * window.electronAPI 上的方法由 contextBridge 暴露：渲染进程「主世界」调用时，
 * Electron 会先用结构化克隆把参数复制到 preload 的「隔离世界」。Vue 3 的响应式对象
 * 是 Proxy，结构化克隆序列化不了 Proxy，于是**在进入 preload 之前**就抛出
 * "An object could not be cloned."（preload 里的代码根本不会执行）。
 *
 * 所以凡是往 window.electronAPI 传对象 / 数组，先过一遍 toPlain()。
 */
export function toPlain(value, seen) {
    const type = typeof value
    if (type === 'function' || type === 'symbol') return undefined
    if (type !== 'object' || value === null) return value

    // Date / RegExp / Map / Set / ArrayBuffer / TypedArray 本身就能被结构化克隆，原样传递
    if (value instanceof Date || value instanceof RegExp || value instanceof Map
        || value instanceof Set || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return value
    }

    const visited = seen || new WeakMap()
    const cached = visited.get(value)
    if (cached) return cached

    if (Array.isArray(value)) {
        const out = []
        visited.set(value, out)
        for (let i = 0; i < value.length; i++) out[i] = toPlain(value[i], visited)
        return out
    }

    const out = {}
    visited.set(value, out)
    Object.keys(value).forEach((key) => {
        const plain = toPlain(value[key], visited)
        if (plain !== undefined) out[key] = plain
    })
    return out
}
