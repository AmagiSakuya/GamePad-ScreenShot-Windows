# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>Capturez l'écran ou une fenêtre et gardez les dernières secondes en boucle, depuis votre manette</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 Présentation

Un utilitaire Windows qui permet de déclencher des captures d'écran avec des **combinaisons de boutons** ou des **valeurs d'axe** de votre manette, plutôt qu'au clavier — idéal pour les jeux qui capturent la souris ou tournent en plein écran. Les captures s'enregistrent sur le disque ou dans le presse-papiers, et le moteur d'**enregistrement en boucle** intégré garde les dernières secondes en mémoire : un **appui long** transforme votre moment en MP4, sans OBS. Il permet aussi de **mapper les boutons de la manette sur des touches ou combinaisons du clavier**, comme un pavé de raccourcis.

- ✅ Déclenchement par combinaison de boutons ou valeur d'axe (croix directionnelle, L2 / R2…)
- ✅ Déclencheur clavier supplémentaire
- ✅ Capture plein écran (écran sélectionnable en multi-écrans) ou capture d'une fenêtre
- ✅ Enregistrement en fichier, presse-papiers ou les deux — JPG / PNG
- ✅ Modèles de noms de fichiers personnalisés : `%activeWinTitle%`, `%timestamp%`, `%datetime%`…
- ✅ Gestion des conflits de noms : écraser / ajouter un horodatage / ne pas enregistrer / demander à chaque fois
- ✅ Effets sonores de capture — 5 sons intégrés, volume réglable
- ✅ Notification en superposition : position, durée et taille réglables
- ✅ **Enregistrement en boucle** — un appui long sauvegarde les N dernières secondes avec le moteur FFmpeg intégré (NVENC / QSV / AMF / x264), sans OBS
- ✅ Durée de l'appui long réglable et vignette de confirmation après sauvegarde
- ✅ Testeur de manette intégré — boutons, axes et croix directionnelle s'allument en direct
- ✅ 9 langues d'interface, thèmes sombre / clair, 6 couleurs d'accent
- ✅ **Boutons de manette → touches du clavier** — un bouton ou une combi envoie n’importe quelle touche / combinaison, y compris Win et les touches multimédia
- ✅ Trois déclencheurs : Appui / Maintien / Répétition, seuil et intervalle réglables, chaque règle activable séparément
- ✅ Les touches s’ajoutent une par une : aucun raccourci système déclenché pendant la configuration
- ✅ Lancement au démarrage, démarrage silencieux, réduction dans la zone de notification, écoute des captures / mappage au lancement
- ✅ Mises à jour intégrées à l'application

---

## 🖼️ Aperçu de l'interface

### Fenêtre principale

<p align="center">
  <img src="images/shot-main.png" alt="Fenêtre principale" width="720" />
</p>

### Mappage des boutons

<p align="center">
  <img src="images/shot-mapping.png" alt="Mappage des boutons" width="720" />
</p>

### Thème clair

<p align="center">
  <img src="images/shot-main-light.png" alt="Thème clair" width="720" />
</p>

### Notification en superposition

<p align="center">
  <img src="images/shot-overlay.png" alt="Notification en superposition" width="720" />
</p>

### Testeur de manette

<p align="center">
  <img src="images/shot-tester.png" alt="Testeur de manette" width="720" />
</p>

### Réglages système

<p align="center">
  <img src="images/shot-settings.png" alt="Réglages système" width="720" />
</p>

---

## 🎮 Configurer une combinaison de boutons

> **Remarque :** les valeurs d'axe (croix directionnelle, gâchettes L2 / R2…) peuvent aussi servir de déclencheur. Un axe n'est considéré comme « pressé » qu'au-delà de **±0,85**.

1. Ajoutez des touches dans le cadre **Manette · Raccourci**. Pour savoir à quel bouton physique correspond chaque entrée, utilisez le **testeur de manette** intégré : le bouton s'allume en direct quand vous appuyez dessus.

<p align="center">
  <img src="images/shot-shortcut.png" alt="Réglage des raccourcis" width="720" />
</p>

> **Astuce :** certaines manettes changent de numéros de boutons en Bluetooth — configurez vos raccourcis de préférence en **USB**.

---

## ⌨️ Mapper les boutons de la manette au clavier

Idéal pour les actions réservées au clavier — changer de piste, push-to-talk, barre de raccourcis — désormais déclenchables depuis la manette.

1. Ouvrez la page **Mappage** et cliquez sur **Démarrer** en haut à droite (pour un lancement automatique : **Réglages → Démarrer le mappage au lancement**).
2. Cliquez sur **Nouveau mappage**, puis **Détecter** côté manette et appuyez sur un bouton — plusieurs en même temps forment une combinaison.
3. Côté clavier, cliquez sur **Ajouter une touche** et appuyez sur les touches une par une (les modificateurs d’abord : Ctrl / Shift / Alt / Win). Le × sur une touche la supprime.
4. Choisissez le déclencheur de chaque ligne : **Appui** / **Maintien** (seuil sous « Seuil de maintien ») / **Répétition** (intervalle sous « Intervalle de répétition »).
5. Activez **Journal** dans *Déclenchements récents* pour voir les hits en direct.

> **Remarque :** le mappage envoie seulement des touches ; il ne bloque pas l’entrée d’origine de la manette, le jeu la reçoit toujours. Pour la bloquer, il faut un pilote de manette virtuelle (ViGEm / HidHide par ex.).

---

## 🔁 Enregistrement en boucle

Ici, enregistrer ne veut pas dire « démarrer → arrêter » : le moteur garde les **dernières secondes** en mémoire pendant l'écoute et n'écrit sur le disque qu'à l'appui long.

1. Ouvrez la page **Capture** et passez **Enregistrement en boucle** sur **Activé** dans *Source de capture*.
2. Juste en dessous, choisissez les secondes d'**Appui long** (0,5 / 0,8 / 1 / 1,5 / 2 / 3 s) : maintenez la combinaison ce temps pour sauvegarder ; relâchez plus tôt et vous obtenez une capture classique.
3. **Paramètres** permet d'ajuster l'encodeur (NVENC / QSV / AMF / x264), la résolution, les fps, la qualité ou le débit, la durée du tampon et la mémoire maximale.
4. Peur de perdre des images ? **Tester les performances d'encodage** fait une vraie capture + encodage et indique les images perdues et la marge restante.
5. Les MP4 enregistrés utilisent le même dossier et le même modèle de nom que les captures, et une notification avec **vignette** confirme la sauvegarde.

> **Remarque :** la source d'enregistrement suit la **cible de capture** — écran enregistre tout l'écran, fenêtre seulement cette fenêtre. Le tampon ne tourne que pendant l'écoute.

---

## 📄 Licence

Ce logiciel est publié sous licence [GNU GPL v3](../LICENSE).
