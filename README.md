# 🚀 Antigravity Mail Server (Mail-Automator v3.3)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

**Antigravity Mail Server v3.3**은 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 메일을 자동으로 수집, 분석하여 구글 독스(Google Docs) 보고서로 정리하고 텔레그램(Telegram) 및 Home Assistant(HA) 모바일 앱으로 실시간 요약 알림을 전송하는 차세대 스마트 메일 비서 시스템입니다.

---

## 🌟 v3.3 주요 신규 특징 (Key Features)

- **🤖 하이브리드 멀티 AI 엔진 팩토리 (`AIFactory`)**: 
  - **Ollama (로컬 AI)**: CPU/GPU 환경에서 1건 단위 순차 처리로 환각 없이 안전 추론.
  - **Google Gemini (API)**: 구글 게이트웨이 REST 통신 파이프라인 기반으로 20건 모음 1회 처리 (속도 10배 향상). 제미나이 3.8-flash 및 3.6-flash 지원.
  - **OpenAI ChatGPT (API)**: GPT-4o-mini 지원.
- **✂️ 스마트 샌드위치 절삭 (Smart Sandwich Truncation)**:
  - 본문이 너무 길 경우 토큰 최적화를 위해 앞부분(핵심)과 뒷부분(결론/서명)을 남기고 중간을 지능적으로 절삭하여 정보 손실 최소화.
- **📎 첨부파일 인젝션 (Attachment Injection)**:
  - 메일에 포함된 첨부파일 메타데이터 및 텍스트를 인젝션하여 AI가 첨부파일의 주요 내용까지 요약 및 분석 가능.
- **🛡️ 정책위반 방어 및 지수 백오프 Retry Guard**:
  - `401/403/400` 등 복구 불가능한 인증/권한 에러는 계정 보호를 위해 즉시 중단 (`Policy Guard`).
  - `429/503` 등 서버 트랜지언트 부하 오류 발생 시 지수 백오프+Jitter(3.5s -> 7s -> 14s) 3회 대기 후 자동 복구 (`Retry Guard`).
- **📱 듀얼 알림 라우터 (`NotificationRouter`)**:
  - `TELEGRAM`, `HA_NOTIFY` (Home Assistant 스마트폰 모바일 앱 푸시), `BOTH` (동시 전송) 지원.
  - 모바일 구글 문서 앱 호환 열람 전용 딥링크(`/view?usp=sharing`) 자동 전송.
- **🧙‍♂️ 지능형 대화형 보안 CLI 대시보드 (`setup.js`)**:
  - **`[A] 🚀 전체 설정 마법사`** 원스톱 순차 입력 모드 탑재.
  - AI 모델 버전(Gemini 3.8/3.6, Ollama, ChatGPT) 번호(1, 2, 3...) 간편 원클릭 선택 및 수동 입력 지원.
  - 민감 키 동적 은닉/보호 및 재노출 UX 완성.
- **📊 실시간 토큰 측정 & Performance 리포팅**:
  - 입력/출력/총 소모 AIP 토큰 실시간 집계 및 성능 측정 로그 출력.

---

## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+)
- **AI Providers**: Ollama (qwen2.5:3b) / Google Gemini (gemini-3.8-flash, gemini-3.6-flash) / OpenAI ChatGPT (gpt-4o-mini)
- **Notify Services**: Telegram Bot API / Home Assistant Mobile Push API
- **APIs & Protocols**: Gmail API, Google Docs API, Google Drive API, Naver IMAP

---

## 🚀 시작하기 (Getting Started)

### 1. 동적 대화형 환경 설정 (`setup.js`)

터미널에서 원스톱 마법사를 실행하여 환경변수를 손쉽게 작성할 수 있습니다:
```bash
node setup.js
```
마법사 메뉴에서 `[A]`를 누르면 필수 정보 및 보안 키를 순차적으로 등록할 수 있습니다.

### 2. 수동 실행
```bash
node index.js
```

### 3. 📑 구글 문서 생성 및 계정 인증/토큰 갱신 (4단계 가이드)

새로운 구글 문서로 교체하거나 사용할 구글 계정을 변경하여 토큰을 재발급받을 때 아래 4단계를 진행합니다:

1. **1단계. 사용할 구글 계정으로 새 구글 문서 생성**
   - [Google Docs](https://docs.google.com)에 접속하여 새 문서를 생성합니다.
   - 브라우저 주소창 URL에서 문서 ID를 복사하여 `.env` 파일의 `GOOGLE_DOC_ID="문서ID"` 항목에 등록합니다.
     *(예: `https://docs.google.com/document/d/{GOOGLE_DOC_ID}/edit`)*
2. **2단계. 구글 계정 재인증 및 `token.json` 갱신**
   - 기존 토큰 삭제 후 인증 스크립트를 실행합니다:
     ```bash
     # 기존 토큰 삭제 (Windows: Remove-Item token.json / Linux: rm token.json)
     node src/auth.js
     ```
   - 터미널에 표시되는 URL로 브라우저에 접속하여 사용할 구글 계정으로 권한을 허용한 뒤, 발급된 인증 코드를 터미널에 입력하여 새 `token.json`을 생성합니다.
3. **3단계. 서버(LXC)에 새 설정 및 토큰 배포**
   - 갱신된 설정 파일과 토큰을 운영 서버로 전송합니다:
     ```bash
     scp token.json .env root@<서버IP>:/opt/Mail-Automator/
     ```
4. **4단계. 서버 프로세스 재시작**
   - 서버에서 새 환경변수(`.env`)와 토큰이 적용되도록 백엔드 프로세스를 재시작합니다:
     ```bash
     pm2 restart all
     ```

---

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.
