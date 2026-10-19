# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>Vollbild-, Fenster- und OBS-Screenshots direkt per Gamepad</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 Einführung

Ein Windows-Tool, mit dem Sie Screenshots über **Gamepad-Tastenkombinationen** oder **Achsenwerte** auslösen statt über die Tastatur — ideal für Spiele, die die Maus einfangen oder im Vollbild laufen. Screenshots lassen sich auf der Festplatte oder in der Zwischenablage speichern; über WebSocket kann zusätzlich **OBS** verbunden werden, um beliebige Szenen aufzunehmen.

- ✅ Auslösen per Tastenkombination oder Achsenwert (Steuerkreuz, L2 / R2 …)
- ✅ Zusätzlicher Tastatur-Auslöser
- ✅ Vollbild-Aufnahme (Monitor wählbar) oder Aufnahme einzelner Fenster
- ✅ Speichern als Datei, in der Zwischenablage oder beides — JPG / PNG
- ✅ Freie Dateinamen-Vorlagen: `%activeWinTitle%`, `%timestamp%`, `%datetime%` …
- ✅ Umgang mit Dateinamenskonflikten: Überschreiben / Zeitstempel anhängen / Nicht speichern / Jedes Mal fragen
- ✅ Screenshot-Soundeffekte — 5 eingebaute Sounds, Lautstärke regelbar
- ✅ Overlay-Benachrichtigung mit einstellbarer Position, Dauer und Größe
- ✅ **OBS-WebSocket**-Anbindung — beliebige OBS-Szenen aufnehmen
- ✅ Langes Drücken speichert den **OBS-Replay-Puffer** als Clip
- ✅ Integrierter Controller-Test — Tasten, Achsen und Steuerkreuz leuchten live auf
- ✅ 9 Oberflächensprachen, dunkles / helles Design, 6 Akzentfarben
- ✅ Autostart, stiller Start, in den Infobereich ausblenden, automatischer Bereitschaftsstart
- ✅ Updates direkt in der App

---

## 🖼️ Oberfläche

### Hauptfenster

<p align="center">
  <img src="images/shot-main.png" alt="Hauptfenster" width="720" />
</p>

### Helles Design

<p align="center">
  <img src="images/shot-main-light.png" alt="Helles Design" width="720" />
</p>

### Overlay-Benachrichtigung

<p align="center">
  <img src="images/shot-overlay.png" alt="Overlay-Benachrichtigung" width="720" />
</p>

### Controller-Test

<p align="center">
  <img src="images/shot-tester.png" alt="Controller-Test" width="720" />
</p>

### Systemeinstellungen

<p align="center">
  <img src="images/shot-settings.png" alt="Systemeinstellungen" width="720" />
</p>

---

## 🎮 Tastenkombination einrichten

> **Hinweis:** Auch Achsenwerte (Steuerkreuz-Richtungen, L2 / R2 …) lassen sich als Auslöser verwenden. Eine Achse gilt erst ab **±0,85** als „gedrückt".

1. Fügen Sie in der Karte **Controller · Tastenkombination** Tasten hinzu. Welcher physischen Taste ein Eintrag entspricht, sehen Sie im integrierten **Controller-Test** — die Taste leuchtet beim Drücken in Echtzeit auf.

<p align="center">
  <img src="images/shot-shortcut.png" alt="Tastenkombination" width="720" />
</p>

> **Tipp:** Bei manchen Controllern ändern sich die Tastennummern im Bluetooth-Betrieb — konfigurieren Sie Kombinationen bevorzugt per **USB**.

---

## ⚙️ Über OBS aufnehmen

1. Aktivieren Sie den **WebSocket-Server** in OBS manuell (meist im Menü „Tools").
2. Öffnen Sie die Seite **Aufnahme** und stellen Sie die **Aufnahmemethode** auf **OBS** — darunter klappt das OBS-Verbindungsfeld auf.

<p align="center">
  <img src="images/shot-obs.png" alt="OBS-Verbindung" width="720" />
</p>

3. Geben Sie die **Adresse** des OBS-Servers (`ws://IP:Port`) und das **Passwort** ein.
4. Klicken Sie auf **OBS verbinden**.
5. Wählen Sie nach dem Verbinden in der Dropdown-Liste die **Szene** aus, die aufgenommen werden soll.
6. Halten Sie die Tastenkombination gedrückt, um die Szene aufzunehmen. Bei aktiviertem „Replay-Puffer per langem Druck speichern" sichert ein **langer Druck** den OBS-Replay-Puffer als Clip.

---

## 📄 Lizenz

Dieses Programm wird unter der [GNU GPL v3](../LICENSE) veröffentlicht.
