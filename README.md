# 🎮 GamePad-ScreenShot

<p align="center">
  <img src="./src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>使用手柄快捷键进行全屏截图 或 OBS截图的工具</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
    <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="coverage">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="coverage">
</div>

---

## 📖 简介

一个允许你使用**手柄按钮(Button)组合**来触发**全屏截图** 或者 **OBS 截图** 的程序。

- ✅ 支持组合键触发
- ✅ 支持自定义手柄与外设扩展
- ✅ 支持**OBS-Websocket**连接，使用**OBS场景**来截图

---

## 🖼️ 软件界面

<p align="center">
  <img src="./images/1.jpg" alt="软件主界面" width="600" />
</p>

---

## 🎮 如何设置组合按键

> 通常情况 DPad上下左右和R2 L2为轴值（Axis）所以暂时无法作为触发按键
>
1. 截图设置中【组合按钮】里的选项含义，可通过调试工具查看是哪一个Button。

<p align="center">
  <img src="./images/2.jpg" alt="软件主界面" width="500" />
</p>

---
## ⚙️ 通过OBS截图
1. 在 OBS 软件中手动开启 **WebSocket 服务器**（通常在“工具”菜单下）。
2. 打开本软件的 **OBS 连接设置** 页面。
3. 准确填写 OBS 服务器的 **IP 地址**、**端口号**及**密码**。
4. 点击连接服务
<p align="center">
  <img src="./images/3.jpg" alt="软件主界面" width="500" />
</p>

5. 在下拉列表中选择你想要抓取的 **场景 (Scene)**
<p align="center">
  <img src="./images/4.jpg" alt="软件主界面" width="500" />
</p>
6. 返回软件的 **截图设置** 页面，将“截图方式”切换为 **OBS** 即可生效。

---
## 📋 开发计划 (TODO)

- [x] 增加对标准 XBOX、NS、DS5 手柄的支持
- [x] 降低自定义手柄的扩展难度
- [x] 对接OBS的Socket服务 从而使用OBS来截图
- [x] 摒弃HID 改用SDL2 从而实现更好的手柄兼容性
- [ ] 手柄轴值响应
- [ ] 按键数量对应
- [ ] 音频音量调整
- [ ] 支持可选的截图格式

---

## ⚠️ 已知局限性

**以下局限性 可以通过连接OBS截图解决**

- 使用不支持非 16:9 屏幕比例适配
- 多屏幕环境下无法选择特定屏幕截图
- 仅支持全屏截图，不支持窗口截图

---