# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>Vollbild- und Fenster-Screenshots plus Loop-Aufnahme der letzten Sekunden direkt per Gamepad</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 Einführung

Ein Windows-Tool, mit dem Sie Screenshots über **Gamepad-Tastenkombinationen** oder **Achsenwerte** auslösen statt über die Tastatur — ideal für Spiele, die die Maus einfangen oder im Vollbild laufen. Screenshots lassen sich auf der Festplatte oder in der Zwischenablage speichern; die integrierte **Loop-Aufnahme** hält die letzten Sekunden im Speicher, sodass ein **langer Druck** den Höhepunkt als MP4 sichert — ganz ohne OBS. Außerdem lassen sich **Gamepad-Tasten auf Tastaturtasten oder -kombinationen abbilden** — der Controller wird zur Shortcut-Leiste.

- ✅ Auslösen per Tastenkombination oder Achsenwert (Steuerkreuz, L2 / R2 …)
- ✅ Zusätzlicher Tastatur-Auslöser
- ✅ Vollbild-Aufnahme (Monitor wählbar) oder Aufnahme einzelner Fenster
- ✅ Speichern als Datei, in der Zwischenablage oder beides — JPG / PNG
- ✅ Freie Dateinamen-Vorlagen: `%activeWinTitle%`, `%timestamp%`, `%datetime%` …
- ✅ Umgang mit Dateinamenskonflikten: Überschreiben / Zeitstempel anhängen / Nicht speichern / Jedes Mal fragen
- ✅ Screenshot-Soundeffekte — 5 eingebaute Sounds, Lautstärke regelbar
- ✅ Overlay-Benachrichtigung mit einstellbarer Position, Dauer und Größe
- ✅ **Loop-Aufnahme** — langer Druck speichert die letzten N Sekunden mit integriertem FFmpeg-Encoder (NVENC / QSV / AMF / x264), ohne OBS
- ✅ Einstellbare Langdruck-Dauer, Vorschaubild im Overlay nach dem Speichern
- ✅ Integrierter Controller-Test — Tasten, Achsen und Steuerkreuz leuchten live auf
- ✅ 9 Oberflächensprachen, dunkles / helles Design, 6 Akzentfarben
- ✅ **Gamepad-Tasten → Tastaturtasten** — eine Taste oder Kombi löst beliebige Tasten / Kombinationen aus, inkl. Win- und Medientasten
- ✅ Drei Auslöser: Druck / Halten / Wiederholen – Schwellwert und Intervall einstellbar, jede Regel einzeln schaltbar
- ✅ Tasten werden einzeln aufgenommen, damit beim Einrichten keine System-Shortcuts ausgelöst werden
- ✅ Autostart, stiller Start, in den Infobereich ausblenden, Screenshot-Listener / Tastenzuordnung beim Start starten
- ✅ Updates direkt in der App

---

## 🖼️ Oberfläche

### Hauptfenster

<p align="center">
  <img src="images/shot-main.png" alt="Hauptfenster" width="720" />
</p>

### Tastenzuordnung

<p align="center">
  <img src="images/shot-mapping.png" alt="Tastenzuordnung" width="720" />
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

## ⌨️ Gamepad-Tasten auf die Tastatur legen

Praktisch für Aktionen, die es nur auf der Tastatur gibt – Titel wechseln, Push-to-Talk, Hotbar-Plätze – jetzt vom Controller aus.

1. Öffne die Seite **Zuordnung** und klicke oben rechts auf **Starten** (für Autostart: **Optionen → Tastenzuordnung beim Start** aktivieren).
2. Klicke **Neue Zuordnung**, dann **Erkennen** auf der Gamepad-Seite und drücke eine Taste – mehrere gleichzeitig ergeben eine Kombi.
3. Auf der Tastaturseite **Taste hinzufügen** klicken und die Tasten einzeln drücken (Modifikatoren wie Ctrl / Shift / Alt / Win zuerst). Das × auf einer Taste entfernt sie.
4. Rechts pro Zeile den Auslöser wählen: **Druck** / **Halten** (Schwelle unter „Haltezeit“) / **Wiederholen** (Intervall unter „Wiederholrate“).
5. Aktiviere **Protokoll** bei *Letzte Auslösungen*, um Treffer live zu sehen.

> **Hinweis:** Die Zuordnung sendet nur Tasten und blockiert die Originaleingabe des Gamepads nicht – das Spiel erhält sie weiterhin. Zum Blockieren braucht es einen virtuellen Gamepad-Treiber (z. B. ViGEm / HidHide).

---

## 🔁 Loop-Aufnahme der letzten Sekunden

Aufnehmen heißt hier nicht „Start → Stopp": Die Engine hält die **letzten Sekunden** im Speicher, solange die Überwachung läuft, und schreibt erst beim langen Druck auf die Festplatte.

1. Öffnen Sie die Seite **Aufnahme** und stellen Sie **Loop-Aufnahme** unter *Aufnahmequelle* auf **Ein**.
2. Wählen Sie direkt darunter die Sekunden für **Langdruck** (0,5 / 0,8 / 1 / 1,5 / 2 / 3 s) — so lange halten, dann wird gespeichert; früher loslassen erzeugt ein normales Bild.
3. Unter **Einstellungen** lassen sich Encoder (NVENC / QSV / AMF / x264), Auflösung, FPS, Qualität oder Bitrate, Pufferlänge und Speicherlimit feinjustieren.
4. Unsicher, ob Frames verloren gehen? **Encoder-Leistung testen** führt eine echte Aufnahme + Kodierung aus und nennt verworfene Frames und Reserven.
5. Gespeicherte MP4s nutzen denselben Ordner und dieselbe Dateinamen-Vorlage wie Screenshots; ein Overlay mit **Vorschaubild** bestätigt das Speichern.

> **Hinweis:** Die Aufnahmequelle folgt dem **Aufnahmeziel** — Bildschirm nimmt den ganzen Monitor auf, Fenster nur dieses Fenster. Der Puffer läuft nur während der Überwachung.

---

## 📄 Lizenz

Dieses Programm wird unter der [GNU GPL v3](../LICENSE) veröffentlicht.
