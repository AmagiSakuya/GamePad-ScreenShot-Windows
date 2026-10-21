# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>Capturas de pantalla completa y de ventana, más grabación en bucle de los últimos segundos, con tu mando</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 Introducción

Una utilidad para Windows que permite hacer capturas con **combinaciones de botones** o **valores de eje** del mando en lugar del teclado — perfecta para juegos que capturan el ratón o se ejecutan a pantalla completa. Las capturas se guardan en disco o en el portapapeles, y el motor integrado de **grabación en bucle** mantiene en memoria los últimos segundos: una **pulsación larga** convierte tu momento en un MP4, sin necesidad de OBS. También permite **mapear los botones del mando a teclas o combinaciones del teclado**, como un panel de atajos.

- ✅ Disparo por combinación de botones o valor de eje (cruceta, L2 / R2…)
- ✅ Disparador de teclado adicional
- ✅ Captura de pantalla completa (monitor seleccionable) o de una ventana
- ✅ Guardar en archivo, portapapeles o ambos — JPG / PNG
- ✅ Plantillas de nombre personalizadas: `%activeWinTitle%`, `%timestamp%`, `%datetime%`…
- ✅ Gestión de nombres duplicados: sobrescribir / añadir marca de tiempo / no guardar / preguntar siempre
- ✅ Efectos de sonido de captura — 5 sonidos integrados con volumen ajustable
- ✅ Notificación superpuesta con posición, duración y tamaño configurables
- ✅ **Grabación en bucle** — mantén la combinación para guardar los últimos N segundos con el motor FFmpeg integrado (NVENC / QSV / AMF / x264), sin OBS
- ✅ Segundos de pulsación larga ajustables y miniatura en el aviso al guardar
- ✅ Prueba de mando integrada — botones, ejes y cruceta se iluminan en vivo
- ✅ 9 idiomas de interfaz, temas oscuro / claro y 6 colores de acento
- ✅ **Botones del mando → teclas del teclado** — un botón o una combinación envía cualquier tecla / combinación, incluidas Win y teclas multimedia
- ✅ Tres disparadores: Pulsar / Mantener / Repetir, con umbral e intervalo ajustables y cada regla activable por separado
- ✅ Las teclas se añaden una a una, así que configurar no dispara atajos del sistema
- ✅ Inicio automático, inicio silencioso, ocultar en la bandeja, escucha de capturas / mapeo al arrancar
- ✅ Actualizaciones desde la propia aplicación

---

## 🖼️ Interfaz

### Ventana principal

<p align="center">
  <img src="images/shot-main.png" alt="Ventana principal" width="720" />
</p>

### Mapeo de botones

<p align="center">
  <img src="images/shot-mapping.png" alt="Mapeo de botones" width="720" />
</p>

### Tema claro

<p align="center">
  <img src="images/shot-main-light.png" alt="Tema claro" width="720" />
</p>

### Notificación superpuesta

<p align="center">
  <img src="images/shot-overlay.png" alt="Notificación superpuesta" width="720" />
</p>

### Prueba de mando

<p align="center">
  <img src="images/shot-tester.png" alt="Prueba de mando" width="720" />
</p>

### Ajustes del sistema

<p align="center">
  <img src="images/shot-settings.png" alt="Ajustes del sistema" width="720" />
</p>

---

## 🎮 Configurar una combinación de botones

> **Nota:** los valores de eje (direcciones de la cruceta, gatillos L2 / R2…) también pueden usarse como disparadores. Un eje solo cuenta como «pulsado» al superar **±0,85**.

1. Añade teclas en la tarjeta **Mando · Atajo**. Para comprobar a qué botón físico corresponde cada entrada, usa la **prueba de mando** integrada: el botón se ilumina en vivo al pulsarlo.

<p align="center">
  <img src="images/shot-shortcut.png" alt="Ajuste de atajos" width="720" />
</p>

> **Consejo:** algunos mandos cambian los números de botón por Bluetooth — configura los atajos preferiblemente por **USB**.

---

## ⌨️ Mapear los botones del mando al teclado

Ideal para acciones que solo existen en el teclado — cambiar de canción, pulsar para hablar, barra de accesos — ahora desde el mando.

1. Abre la página **Mapeo** y pulsa **Iniciar** arriba a la derecha (para que arranque solo: **Ajustes → Iniciar el mapeo al arrancar**).
2. Pulsa **Nuevo mapeo**, luego **Detectar** en el lado del mando y aprieta un botón — varios a la vez forman una combinación.
3. En el lado del teclado pulsa **Añadir tecla** y presiona las teclas una a una (primero los modificadores: Ctrl / Shift / Alt / Win). La × de una tecla la elimina.
4. Elige el disparador de cada fila: **Pulsar** / **Mantener** (umbral en «Umbral de pulsación») / **Repetir** (intervalo en «Intervalo de repetición»).
5. Activa **Registro** en *Últimos disparos* para ver los aciertos en tiempo real.

> **Nota:** el mapeo solo envía teclas; no bloquea la entrada original del mando, el juego la sigue recibiendo. Para bloquearla hace falta un driver de mando virtual (ViGEm / HidHide, por ejemplo).

---

## 🔁 Grabación en bucle

Grabar aquí no es «iniciar → detener»: el motor mantiene en memoria los **últimos segundos** mientras escuchas y solo escribe en disco con una pulsación larga.

1. Abre la página **Captura** y cambia **Grabación en bucle** a **Activada** en *Origen de captura*.
2. Justo debajo elige los segundos de **Pulsación larga** (0,5 / 0,8 / 1 / 1,5 / 2 / 3 s): mantén la combinación ese tiempo para guardar; si sueltas antes, se hace una captura normal.
3. En **Ajustes** puedes afinar el codificador (NVENC / QSV / AMF / x264), la resolución, los fps, la calidad o el bitrate, la duración del búfer y el límite de memoria.
4. ¿Dudas de si perderá fotogramas? **Probar rendimiento del codificador** hace una captura + codificación real e indica los fotogramas perdidos y el margen.
5. Los MP4 guardados usan la misma carpeta y plantilla de nombre que las capturas, y un aviso con **miniatura** confirma el guardado.

> **Nota:** la fuente de grabación sigue al **Objetivo de captura**: pantalla graba todo el monitor y ventana solo esa ventana. El búfer solo funciona mientras escuchas.

---

## 📄 Licencia

Este programa se publica bajo la licencia [GNU GPL v3](../LICENSE).
