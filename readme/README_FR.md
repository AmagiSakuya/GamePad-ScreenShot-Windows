# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>Capturez l'écran, une fenêtre ou OBS avec votre manette</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 Présentation

Un utilitaire Windows qui permet de déclencher des captures d'écran avec des **combinaisons de boutons** ou des **valeurs d'axe** de votre manette, plutôt qu'au clavier — idéal pour les jeux qui capturent la souris ou tournent en plein écran. Les captures s'enregistrent sur le disque ou dans le presse-papiers, et une connexion à **OBS** via WebSocket permet de capturer n'importe quelle scène. Il permet aussi de **mapper les boutons de la manette sur des touches ou combinaisons du clavier**, comme un pavé de raccourcis.

- ✅ Déclenchement par combinaison de boutons ou valeur d'axe (croix directionnelle, L2 / R2…)
- ✅ Déclencheur clavier supplémentaire
- ✅ Capture plein écran (écran sélectionnable en multi-écrans) ou capture d'une fenêtre
- ✅ Enregistrement en fichier, presse-papiers ou les deux — JPG / PNG
- ✅ Modèles de noms de fichiers personnalisés : `%activeWinTitle%`, `%timestamp%`, `%datetime%`…
- ✅ Gestion des conflits de noms : écraser / ajouter un horodatage / ne pas enregistrer / demander à chaque fois
- ✅ Effets sonores de capture — 5 sons intégrés, volume réglable
- ✅ Notification en superposition : position, durée et taille réglables
- ✅ Intégration **OBS-WebSocket** — capture de n'importe quelle scène OBS
- ✅ Appui long pour enregistrer le **tampon de rejeu OBS** en clip
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

## ⚙️ Capturer via OBS

1. Activez manuellement le **serveur WebSocket** dans OBS (généralement dans le menu « Outils »).
2. Ouvrez la page **Capture** et passez la **méthode de capture** sur **OBS** — le panneau de connexion OBS se déploie juste en dessous.

<p align="center">
  <img src="images/shot-obs.png" alt="Connexion OBS" width="720" />
</p>

3. Saisissez l'**adresse** du serveur OBS (`ws://IP:Port`) et le **mot de passe**.
4. Cliquez sur **Se connecter à OBS**.
5. Une fois connecté, choisissez dans la liste déroulante la **scène** à capturer.
6. Maintenez le raccourci pour capturer la scène. Si « Appui long pour sauvegarder le tampon de rejeu » est activé, un **appui long** enregistre le tampon de rejeu OBS en clip.

---

## 📄 Licence

Ce logiciel est publié sous licence [GNU GPL v3](../LICENSE).
