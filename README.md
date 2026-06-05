# 🚀 Antigravity Mail Server (Mail-Automator)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)

**Antigravity Mail Server**는 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 뉴스레터를 자동으로 수집, 요약하여 구글 독스(Google Docs) 보고서로 정리하고 카카오톡 알림으로 진행 상황을 공유해주는 스마트 메일 비서 시스템입니다.

---

## 🌟 주요 특징 (Key Features)

- **📧 멀티 채널 메일 통합**: Gmail API 및 Naver IMAP을 지원하여 분산된 메일을 한곳에 모읍니다.
- **🧹 지능형 클린업 (Auto-Cleanup)**: 광고성 프로모션, 불필요한 알림 등을 자동으로 감지하여 휴지통으로 이동시켜 편지함을 쾌적하게 유지합니다.
- **⚡ 하이브리드 배치 요약 엔진 (V5 Optimization)**: 
  - **Shift-Left 필터링**: `isStaticBypass` 로직을 통해 광고성 메일을 LLM 호출 없이 즉시 판별하여 비용을 절감합니다.
  - **배치 처리 모드**: 한 번의 API 호출로 최대 10건의 메일을 동시 요약합니다. Ollama(로컬 LLM)를 사용하므로 외부 API 할당량 제약에서 완전히 자유롭습니다.
- **🔍 동적 IP 디스커버리 (Auto-Discovery)**: 로컬 네트워크에 배포된 Ollama 서버(SuperLLM LXC)의 IP를 자동 탐색합니다.
  - **3단계 폴백**: `.env` 고정 IP → mDNS(`superllm.local`) → 서브넷 스캔(192.168.0.x) 순으로 탐색하며, 결과를 캐싱하여 재호출 시 즉시 반환합니다.
  - **자동 복구**: 통신 실패 시 캐시를 초기화하여 다음 실행에서 재탐색을 유도합니다.
- **🎯 LLM 기반 동적 분류**: 단순 키워드를 넘어 LLM이 메일 본문의 맥락을 분석하여 **중요도(긴급/보통/낮음)**와 **후속 조치(필요/참고/무시)**를 정밀하게 판별합니다.
- **💎 프리미엄 클린 스타일 가이드**: 구글 독스 보고서에서 시각적 노이즈를 제거하고, 순수 텍스트와 개별 스타일링(색상/굵기/크기)만 사용하여 가독성을 극대화했습니다.
- **💬 멀티 알림 시스템**: 작업 완료 시 카카오톡 메시지를 통해 실시간으로 보고서 생성 알림을 전송합니다.
- **🧠 영구 지식 관리 (`.agent`)**: 프로젝트의 핵심 아키텍처, 이슈 해결 이력, 프리미엄 가이드라인을 `.agent` 폴더에 구조화하여 에이전트의 연속성을 보장합니다.
- **🛠️ 자동화 및 유지보수**: 6개월 경과 데이터 자동 정리 및 문서 초기화 로직을 통해 보고서의 일관성을 유지합니다.

---

## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+) / Ollama qwen2.5:3b (로컬 LLM)
- **Notify Service**: Python (v3.9+)
- **APIs**: Gmail API, Google Docs API, Google Drive API, Kakao Messaging API
- **Protocols**: IMAP (for Naver Mail)

---

## 🚀 시작하기 (Getting Started)

### 1. 전제 조건
⚠️ **[필수] 신규 유저 올인원 구축 가이드**  
LXC 환경에서 처음 구축을 시작하는 분들은 헤매지 마시고 가장 먼저 아래의 올인원 구축 가이드를 순서대로 진행해 주시기 바랍니다.  
Proxmox LXC 템플릿 생성부터 GPU 패스스루 설정, Ollama 엔진 설치 및 가속 최적화까지 모든 과정이 A to Z로 담겨 있습니다.  
👉 [🖥️ SuperLLM LXC 신규 구축 가이드 문서 열기](https://github.com/dicapriokim/LocalAI-ollama-openai)

> 💡 **LXC 구성 팁 (단일 vs 분리 운영)**
> * **분리 운영 (권장)**: AI 백엔드(Ollama)와 본 서비스(Mail-Automator)를 서로 다른 LXC로 구동하면 AI 연산 시 발생하는 자원 점유율(CPU/VRAM) 스파이크로부터 메일 서비스를 안전하게 격리할 수 있습니다.
> * **통합 운영 (대안)**: 하드웨어 자원이 제한적인 경우 하나의 LXC에 통합하여 구동해도 무방합니다. 이 경우 네트워크 탐색 없이 `127.0.0.1:11434` (localhost)로 빠르고 단순하게 통신할 수 있으나, 컨테이너에 충분한 리소스(RAM 등) 할당이 필요합니다.

- Node.js 및 Python 설치
- Google Cloud Console에서 프로젝트 생성 및 API 권한 설정 (`credentials.json`)
- 카카오 개발자 센터에서 앱 등록 및 REST API 키 발급

### 2. 설치
```bash
git clone https://github.com/dicapriokim/Mail-Automation-localAI.git
cd Mail-Automation-localAI
npm install
pip install requests python-dotenv
```

### 3. 환경 설정 (`.env`)
`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 다음과 같이 설정합니다:
```env
# [필수] 메일 계정
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id

# [선택] 카카오 알림
KAKAO_REST_API_KEY=your_key
KAKAO_CLIENT_SECRET=your_secret
KAKAO_TOKEN_PATH=D:\path\to\kakao_token.json

# [선택] 로컬 AI 서버 (Ollama) - 미설정 시 mDNS/서브넷 스캔으로 자동 탐색
LOCAL_AI_IP=192.168.0.100
```

### 4. 실행 (Execution)
```bash
node index.js
```

### 5. LXC 환경 설치 및 크론탭 자동화 가이드
LXC 컨테이너(Ubuntu) 환경에 직접 설치하여 매일 정기적으로 메일 수집 비서를 자동화 구동하려는 경우 아래 단계를 따르십시오.

#### 1) 필수 패키지 및 Node.js 설치
```bash
# 시스템 패키지 업데이트 및 빌드 도구 설치
apt update && apt upgrade -y
apt install git curl build-essential python3 python3-pip -y

# Node.js 20.x 설치 스크립트 다운로드 및 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js 패키지 설치
sudo apt-get install -y nodejs

# 설치 버전 확인 (v20.x.x 이상 확인)
node -v
```

#### 2) 프로젝트 설치 및 의존성 다운로드
```bash
cd /opt
git clone https://github.com/dicapriokim/Mail-Automation-localAI.git Mail-Automator
cd Mail-Automator
npm install
pip install requests python-dotenv
```

#### 3) 환경 변수 및 구글 인증 자격증명 복사
* `/opt/Mail-Automator/.env` 파일을 생성하고 본인의 메일 및 토큰 환경 설정을 작성합니다.
* 외부에서 발급받은 `credentials.json`과 `token.json` 파일을 `/opt/Mail-Automator/` 루트 경로에 복사합니다.
* `token.json`이 존재하지 않는 경우 터미널에서 최초 1회 수동 실행(`node index.js`)하여 나타나는 인증 URL에 접속하고 로그인 권한을 허용하여 생성합니다.

#### 4) 크론탭(Crontab) 정기 스케줄러 등록
매일 정해진 시간(예: 매일 오전 9시 정각)에 메일 비서가 자동으로 메일을 수집하고 보고서를 작성하도록 시스템 크론을 구성합니다.
```bash
crontab -e
```
설정 최하단에 아래 실행 행을 추가하고 저장합니다:
```cron
00 09 * * * cd /opt/Mail-Automator && /usr/bin/node index.js >> /opt/Mail-Automator/cron.log 2>&1
```

---

## 📊 보고서 예시 (Sample Report)

V5 스타일링이 적용된 깔끔한 보고서 형태입니다:

> **[2026년 4월 3주차] 요약 보고서**
> **📧 Gmail 뉴스레터 요약**
> - **[2026.04.16] OpenAI | GPT-4o 업데이트 소식**
>   - ➔ 핵심 요약: 범용 인공지능 성능 향상 및 멀티모달 기능 강화에 대한 공지입니다.
>   - ➔ 후속 조치: [참고]
> - **[2026.04.16] Toss | 주간 경제 지표 (긴급)**
>   - ➔ 핵심 요약: 금리 변동성에 따른 긴급 브리핑 자료로 즉각적인 확인이 권장됩니다.
>   - ➔ 후속 조치: [필요]
>
> **📊 금주 정리 통계**
> - Gmail: 12건 정규화 완료
> - Naver: 8건 정규화 완료

---

## ⚠️ 주의 사항 (Troubleshooting)

1. **Ollama 서버 연결**: 로컬 네트워크에 Ollama 서버(포트 `11434`)가 구동 중이어야 합니다. 자동 탐색이 실패하면 `.env`의 `LOCAL_AI_IP`에 직접 IP를 지정하세요.
2. **인증 파일 보안**: `token.json`, `credentials.json`, `.env` 파일은 보안상 저장소에 포함되지 않습니다. 수동으로 관리해 주세요.
3. **MIME 인코딩**: 네이버 메일의 복잡한 MIME 구조를 본문 정규화 로직이 안전하게 처리합니다.
4. **로컬 LLM 타임아웃**: 로컬 LLM은 응답이 느릴 수 있어 120초 타임아웃이 설정되어 있습니다. 하드웨어 사양에 따라 모델 변경(`qwen2.5:3b`)을 고려하세요.

---

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.

---

### 👑 Developer
- **돼지지렁이** (Antigravity Developer)
