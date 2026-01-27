# 🎮 GamePad-ScreenShot

<p align="center">
  <img src="./src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>使用手柄快捷键进行全屏截图的 Windows 工具</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
    <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="coverage">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="coverage">
</div>

---

## 📖 简介

一个基于 **HID 输入** 的 Windows 工具，允许你使用**手柄快捷键**来触发**全屏截图**。

- ✅ 支持组合键触发
- ✅ 支持自定义手柄与外设扩展（高级功能）
- ✅ 预置适配手柄：**DualShock 4**、**UU远程**

---

## 🖼️ 软件界面

<p align="center">
  <img src="./images/1.jpg" alt="软件主界面" width="600" />
</p>

---

## 🎮 手柄按键映射

| 按键               | DualShock 4 | UU远程     |
| ------------------ | ----------- | ---------- |
| **HOME**           | PS 按钮     | （未实现） |
| **LEFT_SHOULDER**  | L1          | LB         |
| **RIGHT_SHOULDER** | R1          | RB         |
| **START**          | Share       | Select     |
| **SELECT**         | Option      | Start      |

---

## ⚙️ 如何扩展其他手柄（高级）

> ⚠️ 需要具备一定的编程能力

1. 打开 `程序目录/resources/controllerDefinition.js`
2. 在数组中新增一条记录：
   - `deviceName`：界面显示名称
   - `vid` / `pid`：按实际设备填写
3. 编写该记录中的 **USB-HID 数据解析函数** `parseDataFunction`
4. 保存文件后，重新打开程序，选择该设备并保存配置
5. 连接设备后，可在 **Buffer(Debug)** 中查看原始数据，辅助调试和编写`parseDataFunction`

---

## 📋 开发计划 (TODO)

- [ ] 支持可选的截图格式
- [ ] 增加对标准 XBOX、NS、DS5 手柄的支持
- [ ] 降低自定义手柄的扩展难度

---

## ⚠️ 已知局限性

- 不支持非 16:9 屏幕比例适配
- 多屏幕环境下无法选择特定屏幕截图
- 仅支持全屏截图，不支持窗口截图

---