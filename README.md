# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="README.md">简体中文</a> | <a href="readme/README_ZH-TW.md">繁體中文</a> | <a href="readme/README_EN.md">English</a> | <a href="readme/README_JA.md">日本語</a> | <a href="readme/README_KO.md">한국어</a> | <a href="readme/README_DE.md">Deutsch</a> | <a href="readme/README_FR.md">Français</a> | <a href="readme/README_ES.md">Español</a> | <a href="readme/README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>使用手柄快捷键进行全屏截图、窗口截图或 OBS 截图的工具</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 简介

一款 Windows 小工具，让你用手柄的**按键组合**或**轴值**来触发截图，而不必去碰键盘——非常适合那些会独占鼠标、或以全屏运行的游戏。截图可以保存到硬盘或剪贴板，也可以连接 **OBS（WebSocket）** 来截取任意 OBS 场景。

- ✅ 组合键 / 轴值（十字键、L2 / R2 等）触发
- ✅ 额外支持键盘热键触发
- ✅ 全屏截图（可选择特定显示器）或单窗口截图
- ✅ 保存到文件 / 剪贴板 / 两者皆可 —— 支持 JPG / PNG
- ✅ 自定义文件名模板：`%activeWinTitle%`、`%timestamp%`、`%datetime%` ……
- ✅ 文件名冲突处理：覆盖 / 追加时间戳 / 跳过 / 每次询问
- ✅ 截图音效 —— 5 种内置音效，可调节音量
- ✅ 覆层通知，位置、时长、尺寸均可配置
- ✅ **OBS-WebSocket** 集成 —— 截取任意 OBS 场景
- ✅ 长按快捷键保存 **OBS 回放缓存**为片段
- ✅ 内置手柄测试器 —— 按键、轴、十字键实时点亮
- ✅ 9 种界面语言，深色 / 浅色主题，6 种主题色
- ✅ 开机自启、静默启动、最小化到托盘、自动开始监听
- ✅ 应用内更新

---

## 🖼️ 软件界面

### 主界面

<p align="center">
  <img src="readme/images/shot-main.png" alt="主界面" width="720" />
</p>

### 浅色主题

<p align="center">
  <img src="readme/images/shot-main-light.png" alt="浅色主题" width="720" />
</p>

### 覆层通知

<p align="center">
  <img src="readme/images/shot-overlay.png" alt="覆层通知" width="720" />
</p>

### 手柄测试器

<p align="center">
  <img src="readme/images/shot-tester.png" alt="手柄测试器" width="720" />
</p>

### 系统设置

<p align="center">
  <img src="readme/images/shot-settings.png" alt="系统设置" width="720" />
</p>

---

## 🎮 如何设置组合按键

> **说明：** 轴值（十字键方向、L2 / R2 扳机……）同样可以作为触发。轴值需在 **±0.85** 以上才视为“按下”。

1. 在 **控制器 · 组合键** 卡片中添加按键。你可以到内置的 **手柄测试** 页面去核对每个条目对应哪个实体按键——按下按键时它会实时点亮。

<p align="center">
  <img src="readme/images/shot-shortcut.png" alt="组合按键设置" width="720" />
</p>

> **提示：** 部分手柄在蓝牙下会报告不同的按键索引——配置组合键时建议优先使用 **USB** 连接。

---

## ⚙️ 通过 OBS 截图

1. 在 OBS 中手动开启 **WebSocket 服务器**（通常在“工具”菜单下）。
2. 打开 **截图设置** 页面，将 **截图方式** 切换为 **OBS**——OBS 连接面板会随之在下方展开。

<p align="center">
  <img src="readme/images/shot-obs.png" alt="OBS 连接" width="720" />
</p>

3. 填写 OBS 服务器的 **地址**（`ws://IP:端口`）与 **密码**。
4. 点击 **连接 OBS**。
5. 连接成功后，在下拉列表中选择要截取的 **场景**。
6. 按住快捷键即可截取该场景。开启“长按保存回放缓存”后，**长按** 会把 OBS 回放缓存保存为片段。

---

## 📄 许可协议

本程序基于 [GNU GPL v3](../LICENSE) 协议发布。
