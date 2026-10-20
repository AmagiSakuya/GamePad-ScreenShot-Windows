# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>使用手把按鍵組合進行全螢幕、視窗或 OBS 截圖的工具</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 簡介

一款讓你用**手把按鍵組合**或**軸值**取代鍵盤來觸發截圖的 Windows 工具——非常適合會搶走滑鼠或以全螢幕執行的遊戲。截圖可儲存到磁碟或剪貼簿，也能透過 WebSocket 連線 **OBS** 擷取任意場景。另外還支援把手把按鍵**映射成鍵盤按鍵或組合鍵**，把手把當成快速鍵面板來用。

- ✅ 組合按鍵 / 軸值（十字鍵、L2 / R2 等）觸發
- ✅ 額外鍵盤快速鍵觸發
- ✅ 全螢幕截圖（可選擇指定螢幕）或單一視窗截圖
- ✅ 儲存為檔案、剪貼簿或兩者兼有 — JPG / PNG
- ✅ 自訂檔案名稱範本：`%activeWinTitle%`、`%timestamp%`、`%datetime%` 等
- ✅ 檔案名稱衝突策略：覆寫 / 附加時間戳 / 不儲存 / 每次詢問
- ✅ 截圖音效 — 內建 5 種音效，音量可調
- ✅ 覆層通知，位置、持續時間與大小皆可設定
- ✅ 對接 **OBS-WebSocket**，擷取任意 OBS 場景
- ✅ 長按組合鍵即可將 **OBS 回放快取**儲存為影片
- ✅ 內建手把測試 — 按鍵、軸與十字鍵即時點亮
- ✅ 9 種介面語言、深色 / 淺色主題、6 種主題色
- ✅ **手把按鍵 → 鍵盤按鍵** —— 單鍵或組合鍵觸發任意鍵盤按鍵 / 組合鍵，支援 Win 鍵、多媒體鍵
- ✅ 三種觸發方式：按下 / 長按 / 連發，門檻與間隔可調，每條規則可個別啟停
- ✅ 鍵盤按鍵逐一錄入，錄製組合鍵時不會誤觸系統快速鍵
- ✅ 開機自動啟動、靜默啟動、隱藏到系統匣、啟動時執行截圖監聽 / 鍵盤映射
- ✅ 應用程式內更新

---

## 🖼️ 軟體介面

### 主介面

<p align="center">
  <img src="images/shot-main.png" alt="主介面" width="720" />
</p>

### 按鍵映射

<p align="center">
  <img src="images/shot-mapping.png" alt="按鍵映射" width="720" />
</p>

### 淺色主題

<p align="center">
  <img src="images/shot-main-light.png" alt="淺色主題" width="720" />
</p>

### 覆層通知

<p align="center">
  <img src="images/shot-overlay.png" alt="覆層通知" width="720" />
</p>

### 手把測試

<p align="center">
  <img src="images/shot-tester.png" alt="手把測試" width="720" />
</p>

### 系統設定

<p align="center">
  <img src="images/shot-settings.png" alt="系統設定" width="720" />
</p>

---

## 🎮 如何設定組合按鍵

> **注意：** 軸值（十字鍵方向、L2 / R2 扳機等）同樣可以作為觸發條件。軸數值超過 **±0.85** 才會被判定為「按下」。

1. 在**控制器 · 組合按鍵**卡片中新增按鍵。每個選項對應哪個實體按鍵，可透過內建的**手把測試**頁面即時確認——按下按鍵，對應按鈕會即時點亮。

<p align="center">
  <img src="images/shot-shortcut.png" alt="組合按鍵設定" width="720" />
</p>

> **提示：** 部分控制器在藍牙模式下按鍵編號會變化，設定組合鍵時建議使用 **USB 有線連接**。

---

## ⌨️ 手把按鍵映射鍵盤

適合切歌、開麥、快捷列這類只能用鍵盤完成的操作——現在用手把就能觸發。

1. 開啟左側 **映射** 頁，點右上角 **啟動**；想讓它開機就執行，到 **設定 → 啟動時執行按鍵映射** 開啟。
2. 點 **新增映射**，在手把輸入一側點 **辨識**，然後按下手把按鍵——同時按住多個就是組合鍵。
3. 在鍵盤輸出一側點 **+ 新增按鍵**，一個鍵一個鍵地按（先加 Ctrl / Shift / Alt / Win 這類修飾鍵）。點鍵帽上的 × 可以刪掉某個鍵。
4. 每列右側選擇觸發方式：**按下** / **長按**（門檻在下方「長按閾值」調整）/ **連發**（間隔在「連發間隔」調整）。
5. 開啟「最近觸發」的 **記錄** 開關，就能即時看到哪條規則命中。

> **說明：** 映射只負責「送鍵盤」，不會攔截手把的原始輸入——遊戲仍然會收到手把按鍵；真要屏蔽需要虛擬手把驅動（如 ViGEm / HidHide）。

---

## ⚙️ 透過 OBS 截圖

1. 在 OBS 中手動啟用 **WebSocket 伺服器**（通常在「工具」選單下）。
2. 開啟**截圖**頁面，將**截圖方式**切換為 **OBS**，OBS 連線面板會在下方展開。

<p align="center">
  <img src="images/shot-obs.png" alt="OBS 連線" width="720" />
</p>

3. 填寫 OBS 伺服器的**位址**（`ws://IP:連接埠`）與**密碼**。
4. 點擊「**連線 OBS**」。
5. 連線成功後，在下拉選單中選擇要擷取的**場景 (Scene)**。
6. 按住組合鍵即可擷取場景；若已啟用「長按組合鍵儲存回放快取」，**長按**即可將 OBS 回放快取儲存為影片。

---

## 📄 授權條款

本軟體以 [GNU GPL v3](../LICENSE) 授權條款公開發布。
