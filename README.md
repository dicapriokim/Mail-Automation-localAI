# 🚀 Antigravity Mail Local (Mail-Automator Local)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

**Antigravity Mail Local**은 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 뉴스레터를 자동으로 수집, 요약하여 구글 독스(Google Docs) 보고서로 정리하고 텔레그램(Telegram) 봇으로 작업 완료 알림을 즉시 전송하는 스마트 메일 비서 시스템입니다. 본 프로젝트는 외부 클라우드 의존성 없이 **로컬 LLM 서버(Ollama)**를 사용하여 프라이버시를 강화하고 비용을 절감하도록 최적화되었습니다.

## 🌟 주요 특징 (Key Features)

- **📧 멀티 채널 메일 통합**: Gmail API 및 Naver IMAP을 지원하여 분산된 메일을 한곳에 모읍니다.
- **🧠 로컬 AI 엔진 (Ollama)**: 외부 API(Gemini 등) 호출 없이 커스텀 로컬 AI 모델(**antigravity-model**)을 사용하여 데이터를 안전하게 처리합니다.
- **🏗️ Batch Fetch & Close 아키텍처**: IMAP 메일을 배치 수집 후 즉시 연결을 종료하여 추론 지연으로 인한 ECONNRESET을 원천 차단합니다.
- **⚡ Ollama Keep-alive (5m) 기반 고속 추론**: 모델을 5분간 메모리에 상주시켜 메일 건별 반복 로드 지연을 제거합니다.
- **📊 Performance Profile**: 총 소요 시간 및 처리 건수를 자동 측정하여 터미널 로그 및 텔레그램으로 보고합니다.
- **📬 텔레그램 봇 알림**: 작업 완료 후 소요 시간, 처리 건수, 구글 독스 바로가기 링크를 마크다운 서식으로 즉시 알림합니다.
- **🛡️ 시스템 안정성 및 방어 설계**: 
  - **120초 타임아웃**: `AbortController`를 통한 추론 지연 방지.
  - **1초 휴지기(Delay)**: CPU/RAM 과부하 및 쓰로틀링 예방.
  - **오류 격리(Isolation)**: 개별 요약 실패 시에도 전체 프로세스를 보호하는 Fallback 로직.
- **🧹 지능형 클린업 (Auto-Cleanup)**: 광고성 프로모션, 불필요한 알림 등을 자동으로 감지하여 휴지통으로 이동시켜 편지함을 쾌적하게 유지합니다.
- **💎 프리미엄 클린 스타일 가이드**: 구글 독스 보고서에서 시각적 노이즈를 제거하고 가독성을 극대화한 전용 서식을 적용합니다.
- **🕐 문서 무결성 관리**: 모든 보고서 하단에 KST 기준 최종 작성 일시를 **프리미엄 우측 정렬 스타일(9PT, 이탤릭, 회색)**로 자동 삽입하여 문서의 전문성과 이력 추적성을 높였습니다.

## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+) 
- **AI Model**: Ollama / antigravity-model (Local Inference, Keep-alive 5m)
- **Notify Service**: Telegram Bot API (Node.js 내장 fetch)
- **APIs**: Gmail API, Google Docs API, Google Drive API
- **Protocols**: IMAP (for Naver Mail)
- **Architecture**: Batch Fetch & Close (IMAP Idle Timeout 방지)

## 🔄 LLM 모델 교체 (Model Swap)

`OLLAMA_CONFIG` 객체로 모델 설정이 중앙화되어 있어, **한 줄만 변경**하면 다른 모델로 즉시 테스트할 수 있습니다.

```js
// summarize.js 최상단
const OLLAMA_CONFIG = {
    URL: process.env.OLLAMA_API_URL || 'http://192.168.0.32:11434/api/generate',
    MODEL: 'qwen2.5:3b'  // ← 이 값만 변경하면 모델 교체 완료
};
```

나머지 코드(프롬프트, 타임아웃, keep_alive 등)는 모델에 무관하게 동작하므로 별도 수정이 불필요합니다.

## 🚀 시작하기 (Getting Started)

### 1. 전제 조건
- Node.js (v18+) 설치
- **Ollama 서버 구축**: 커스텀 모델 `antigravity-model` 생성 완료
- Google Cloud Console에서 API 권한 설정 (`credentials.json`)
- Telegram BotFather를 통해 봇 토큰 발급

### 2. 설치
```bash
git clone https://github.com/dicapriokim/Antigravity-Mail-Local.git
cd Antigravity-Mail-Local
npm install
```

### 3. 환경 설정 (`.env`)
```env
OLLAMA_API_URL=http://your_ollama_ip:11434/api/generate
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

| 변수 | 설명 |
|------|------|
| `OLLAMA_API_URL` | Ollama 서버 API 엔드포인트 |
| `NAVER_ID` / `NAVER_PW` | 네이버 IMAP 접속 계정 (앱 비밀번호) |
| `GOOGLE_DOC_ID` | 보고서를 기록할 구글 독스 문서 ID |
| `TELEGRAM_BOT_TOKEN` | BotFather를 통해 발급받은 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 알림을 수신할 텔레그램 고유 숫자 ID |

### 4. 실행 (Execution)
```bash
node index.js
```

## ⚠️ 주의 사항 (Troubleshooting)

1. **로컬 AI 성능**: CPU 전용 환경(Proxmox LXC 등)에서는 요약 속도가 느릴 수 있으므로 120초 이상의 타임아웃 설정을 권장합니다.
2. **인증 파일 보안**: `token.json`, `credentials.json`, `.env` 파일은 보안상 저장소에 포함되지 않으며 `.gitignore`에 의해 차단됩니다.
3. **MIME 인코딩**: 네이버 메일의 복잡한 MIME 구조를 본문 정규화 로직이 안전하게 처리합니다.
4. **IMAP 연결 안정성**: Batch Fetch & Close 패턴을 적용하여 LLM 추론 지연 중 IMAP Idle Timeout(ECONNRESET)을 방지합니다.

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.

### 👑 Developer
- **돼지지렁이** (Antigravity Developer)
