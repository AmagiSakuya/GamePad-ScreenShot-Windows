# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>使用手把按鍵組合進行全螢幕、視窗截圖，並循環錄製最近畫面的工具</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 簡介

一款讓你用**手把按鍵組合**或**軸值**取代鍵盤來觸發截圖的 Windows 工具——非常適合會搶走滑鼠或以全螢幕執行的遊戲。截圖可儲存到磁碟或剪貼簿；內建的**循環錄製**引擎會一直留住最近一段畫面，**長按**組合鍵就能把剛才的精華存成 MP4，不需要安裝 OBS。另外還支援把手把按鍵**映射成鍵盤按鍵或組合鍵**，把手把當成快速鍵面板來用。

- ✅ 組合按鍵 / 軸值（十字鍵、L2 / R2 等）觸發
- ✅ 額外鍵盤快速鍵觸發
- ✅ 全螢幕截圖（可選擇指定螢幕）或單一視窗截圖
- ✅ 儲存為檔案、剪貼簿或兩者兼有 — JPG / PNG
- ✅ 自訂檔案名稱範本：`%activeWinTitle%`、`%timestamp%`、`%datetime%` 等
- ✅ 檔案名稱衝突策略：覆寫 / 附加時間戳 / 不儲存 / 每次詢問
- ✅ 截圖音效 — 內建 5 種音效，音量可調
- ✅ 覆層通知，位置、持續時間與大小皆可設定
- ✅ **循環錄製** —— 長按組合鍵儲存最近 N 秒，內建 FFmpeg 引擎（NVENC / QSV / AMF / x264），無需安裝 OBS
- ✅ 長按觸發秒數可調，儲存後提示帶片段縮圖
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

## 🔁 循環錄製最近畫面

錄影不是「開始錄 → 停止」那套，而是**一直留住最近的畫面**：開始監聽後引擎就在背景擷取編碼，資料只放在記憶體裡，長按才寫入磁碟。

1. 開啟**截圖**頁面，在「截圖來源」把 **循環錄製** 切到 **開啟**。
2. 直接在下面選 **長按觸發** 的秒數（0.5 / 0.8 / 1 / 1.5 / 2 / 3 秒）——按住組合鍵到設定秒數就會儲存，提早放開還是照常截圖。
3. 點 **設定** 可以細調：編碼引擎（NVENC / QSV / AMF / x264）、輸出解析度、影格率、畫質或位元率、緩衝長度、記憶體上限。
4. 不確定會不會掉格時點 **測試編碼效能**：端到端跑一遍擷取 + 編碼，直接告訴你掉了幾格、還剩多少餘裕。
5. 儲存的 MP4 使用和截圖相同的資料夾與檔名範本，畫面上會彈出帶**縮圖**的提示確認。

> **說明：** 錄製來源跟隨「截圖目標」，選螢幕就錄整個螢幕、選視窗就只錄那個視窗；緩衝只在監聽期間執行，停止監聽就釋放編碼器。

---

## 📄 授權條款

本軟體以 [GNU GPL v3](../LICENSE) 授權條款公開發布。
