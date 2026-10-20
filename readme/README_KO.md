# 🎮 GamePad-ScreenShot

<p align="center">
  <a href="../README.md">简体中文</a> | <a href="README_ZH-TW.md">繁體中文</a> | <a href="README_EN.md">English</a> | <a href="README_JA.md">日本語</a> | <a href="README_KO.md">한국어</a> | <a href="README_DE.md">Deutsch</a> | <a href="README_FR.md">Français</a> | <a href="README_ES.md">Español</a> | <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <img src="../src/gamepad.ico" alt="GamePad Icon" width="120" />
</p>

<p align="center">
  <strong>게임패드 버튼만으로 전체 화면·창·OBS 스크린샷을 찍는 도구</strong>
</p>

<div align="center">
  <img src="https://img.shields.io/github/license/AmagiSakuya/GamePad-ScreenShot-Windows" alt="license">
  <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/Twitter-@昨夜丶-1DA1F2?logo=twitter" alt="twitter">
</div>

---

## 📖 소개

키보드 대신 게임패드의 **버튼 조합**이나 **축 값**으로 스크린샷을 찍을 수 있는 Windows 도구입니다. 마우스를 가로채거나 전체 화면으로 실행되는 게임에 적합합니다. 파일이나 클립보드에 저장할 수 있고, WebSocket으로 **OBS**에 연결해 원하는 장면도 캡처할 수 있습니다. 또한 **패드 버튼을 키보드 키나 조합으로 매핑**해 패드를 단축키 패드처럼 쓸 수 있습니다.

- ✅ 버튼 조합 / 축 값(십자 키, L2 / R2 등)으로 트리거
- ✅ 추가 키보드 트리거
- ✅ 전체 화면 캡처(캡처할 모니터 선택 가능) 또는 창 단위 캡처
- ✅ 파일·클립보드·모두 저장 지원 — JPG / PNG
- ✅ 파일 이름 템플릿 자유 설정: `%activeWinTitle%`, `%timestamp%`, `%datetime%` 등
- ✅ 파일 이름 충돌 처리: 덮어쓰기 / 타임스탬프 추가 / 저장 안 함 / 매번 묻기
- ✅ 스크린샷 효과음 — 기본 5종, 볼륨 조절
- ✅ 오버레이 알림(위치·지속 시간·크기 설정 가능)
- ✅ **OBS-WebSocket** 연동으로 OBS 장면 캡처
- ✅ 단축키를 길게 눌러 **OBS 리플레이 버퍼**를 클립으로 저장
- ✅ 내장 컨트롤러 테스트 — 버튼·축·십자 키 실시간 표시
- ✅ 9개 언어 UI, 다크 / 라이트 테마, 6가지 강조 색상
- ✅ **패드 버튼 → 키보드 키** —— 단일 버튼이나 조합으로 어떤 키/조합이든 전송, Win 키와 미디어 키 지원
- ✅ 트리거 3종: 누름 / 길게 / 연속. 기준과 간격을 조절할 수 있고 규칙별로 켜고 끌 수 있음
- ✅ 키보드는 한 키씩 등록하므로 조합을 녹화하다 단축키를 잘못 실행하지 않음
- ✅ 시작 시 자동 실행, 사일런트 시작, 트레이로 숨기기, 시작 시 캡처 대기 / 버튼 매핑 실행
- ✅ 앱 내 업데이트

---

## 🖼️ 화면

### 메인 화면

<p align="center">
  <img src="images/shot-main.png" alt="메인 화면" width="720" />
</p>

### 버튼 매핑

<p align="center">
  <img src="images/shot-mapping.png" alt="버튼 매핑" width="720" />
</p>

### 라이트 테마

<p align="center">
  <img src="images/shot-main-light.png" alt="라이트 테마" width="720" />
</p>

### 오버레이 알림

<p align="center">
  <img src="images/shot-overlay.png" alt="오버레이 알림" width="720" />
</p>

### 컨트롤러 테스트

<p align="center">
  <img src="images/shot-tester.png" alt="컨트롤러 테스트" width="720" />
</p>

### 시스템 설정

<p align="center">
  <img src="images/shot-settings.png" alt="시스템 설정" width="720" />
</p>

---

## 🎮 조합키 설정 방법

> **참고:** 축 값(십자 키 방향, L2 / R2 트리거 등)도 트리거로 사용할 수 있습니다. 축은 **±0.85**를 넘어야 '눌림'으로 판정됩니다.

1. **컨트롤러 · 단축키** 카드에서 키를 추가합니다. 각 항목이 어떤 물리 버튼에 해당하는지는 내장된 **컨트롤러 테스트** 페이지에서 확인할 수 있습니다. 버튼을 누르면 실시간으로 표시됩니다.

<p align="center">
  <img src="images/shot-shortcut.png" alt="단축키 설정" width="720" />
</p>

> **팁:** 일부 컨트롤러는 블루투스 모드에서 버튼 번호가 바뀝니다. 단축키를 설정할 때는 **USB 유선 연결**을 권장합니다.

---

## ⌨️ 패드 버튼을 키보드로 매핑

곡 넘기기, 음성 채팅, 단축바처럼 키보드로만 되는 동작을 패드로 실행할 수 있습니다.

1. 왼쪽 **매핑** 페이지를 열고 오른쪽 위 **시작** 을 누릅니다(시작 시 자동 실행은 **설정 → 시작 시 버튼 매핑 실행** 을 켜세요).
2. **새 매핑** 을 누르고 패드 입력 쪽의 **인식** 을 누른 뒤 패드 버튼을 누릅니다. 여러 개를 동시에 누르면 조합이 됩니다.
3. 키보드 출력 쪽에서 **키 추가** 를 누르고 키를 하나씩 누릅니다(Ctrl / Shift / Alt / Win 같은 수정 키를 먼저). 키캡의 × 로 삭제할 수 있습니다.
4. 각 줄 오른쪽에서 트리거를 고릅니다: **누름** / **길게**(기준은 '길게 누름 기준') / **연속**(간격은 '연속 간격').
5. '최근 실행'의 **기록** 을 켜면 어떤 규칙이 동작했는지 실시간으로 볼 수 있습니다.

> **참고:** 매핑은 키를 보내기만 하며 패드의 원래 입력을 막지 않습니다. 게임은 여전히 패드 입력을 받습니다. 막으려면 ViGEm / HidHide 같은 가상 패드 드라이버가 필요합니다.

---

## ⚙️ OBS로 캡처하기

1. OBS에서 **WebSocket 서버**를 수동으로 활성화합니다(보통 '도구' 메뉴에 있습니다).
2. **캡처** 페이지를 열고 **캡처 방식**을 **OBS**로 전환합니다. 그러면 아래에 OBS 연결 패널이 펼쳐집니다.

<p align="center">
  <img src="images/shot-obs.png" alt="OBS 연결" width="720" />
</p>

3. OBS 서버의 **주소**(`ws://IP:포트`)와 **비밀번호**를 입력합니다.
4. '**OBS 연결**'을 클릭합니다.
5. 연결되면 드롭다운에서 캡처할 **장면**을 선택합니다.
6. 단축키를 눌러 장면을 캡처합니다. '단축키를 길게 눌러 리플레이 저장'이 활성화되어 있으면 **길게 눌러서** OBS 리플레이 버퍼를 클립으로 저장할 수 있습니다.

---

## 📄 라이선스

본 소프트웨어는 [GNU GPL v3](../LICENSE) 라이선스로 배포됩니다.
