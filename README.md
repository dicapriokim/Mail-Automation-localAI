# 🚀 Antigravity Mail Local (Mail-Automator Local)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)

**Antigravity Mail Local**은 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 뉴스레터를 자동으로 수집, 요약하여 구글 독스(Google Docs) 보고서로 정리하고 카카오톡 알림으로 진행 상황을 공유해주는 스마트 메일 비서 시스템입니다. 본 프로젝트는 외부 클라우드 의존성 없이 **로컬 LLM 서버(Ollama)**를 사용하여 프라이버시를 강화하고 비용을 절감하도록 최적화되었습니다.

---

## 🌟 주요 특징 (Key Features)

- **📧 멀티 채널 메일 통합**: Gmail API 및 Naver IMAP을 지원하여 분산된 메일을 한곳에 모읍니다.
- **🧠 로컬 AI 엔진 (Ollama)**: 외부 API(Gemini 등) 호출 없이 로컬 AI 서버(**Qwen2.5:1.5b**)를 사용하여 데이터를 안전하게 처리합니다.
- **⚡ 순차 처리 아키텍처 (Sequential Processing)**: 경량 로컬 모델의 안정적인 JSON 출력을 위해 메일을 한 건씩 정밀하게 분석합니다.
- **🛡️ 시스템 안정성 및 방어 설계**: 
  - **120초 타임아웃**: `AbortController`를 통한 추론 지연 방지.
  - **1초 휴지기(Delay)**: CPU/RAM 과부하 및 쓰로틀링 예방.
  - **오류 격리(Isolation)**: 개별 요약 실패 시에도 전체 프로세스를 보호하는 Fallback 로직.
- **🧹 지능형 클린업 (Auto-Cleanup)**: 광고성 프로모션, 불필요한 알림 등을 자동으로 감지하여 휴지통으로 이동시켜 편지함을 쾌적하게 유지합니다.
- **💎 프리미엄 클린 스타일 가이드**: 구글 독스 보고서에서 시각적 노이즈를 제거하고 가독성을 극대화한 전용 서식을 적용합니다.

---

## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+) 
- **AI Model**: Ollama / Qwen2.5:1.5b (Local Inference)
- **Notify Service**: Python (v3.9+)
- **APIs**: Gmail API, Google Docs API, Google Drive API, Kakao Messaging API
- **Protocols**: IMAP (for Naver Mail)

---

## 🚀 시작하기 (Getting Started)

### 1. 전제 조건
- Node.js (v18+) 및 Python (v3.9+) 설치
- **Ollama 서버 구축**: `ollama pull qwen2.5:1.5b` 명령으로 모델 설치 완료
- Google Cloud Console에서 API 권한 설정 (`credentials.json`)
- 카카오 개발자 센터에서 REST API 키 발급

### 2. 설치
```bash
git clone https://github.com/dicapriokim/Antigravity-Mail-Local.git
cd Antigravity-Mail-Local
npm install
pip install requests python-dotenv
```

### 3. 환경 설정 (`.env`)
```env
OLLAMA_API_URL=http://your_ollama_ip:11434/api/generate
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id
KAKAO_REST_API_KEY=your_key
KAKAO_CLIENT_SECRET=your_secret
KAKAO_TOKEN_PATH=D:\path\to\kakao_token.json
```

### 4. 실행 (Execution)
```bash
npm run summarize
```

---

## ⚠️ 주의 사항 (Troubleshooting)

1. **로컬 AI 성능**: CPU 전용 환경(Proxmox LXC 등)에서는 요약 속도가 느릴 수 있으므로 120초 이상의 타임아웃 설정을 권장합니다.
2. **인증 파일 보안**: `token.json`, `credentials.json`, `.env` 파일은 보안상 저장소에 포함되지 않으며 `.gitignore`에 의해 차단됩니다.
3. **MIME 인코딩**: 네이버 메일의 복잡한 MIME 구조를 본문 정규화 로직이 안전하게 처리합니다.

---

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.

---

### 👑 Developer
- **돼지지렁이** (Antigravity Developer)
