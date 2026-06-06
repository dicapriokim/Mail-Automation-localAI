# 🚀 Antigravity Mail Server (Mail-Automator)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

**Antigravity Mail Server**는 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 뉴스레터를 자동으로 수집, 요약하여 구글 독스(Google Docs) 보고서로 정리하고 텔레그램(Telegram) 알림으로 진행 상황을 즉시 전송하는 스마트 메일 비서 시스템입니다.

---

## 🌟 주요 특징 (Key Features)

- **📧 멀티 채널 메일 통합**: Gmail API 및 Naver IMAP을 지원하여 분산된 메일을 한곳에 모웁니다.
- **🧹 지능형 클린업 (Auto-Cleanup)**: 광고성 프로모션, 불필요한 알림 등을 자동으로 감지하여 휴지통으로 이동시켜 편지함을 쾌적하게 유지합니다.
- **⚡ 하이브리드 배치 요약 엔진 (V5 Optimization)**: 
  - **Shift-Left 필터링**: `isStaticBypass` 로직을 통해 광고성 메일을 LLM 호출 없이 즉시 판별하여 비용을 절감합니다.
  - **배치 처리 모드**: 한 번의 API 호출로 최대 10건의 메일을 동시 요약합니다. Ollama(로컬 LLM)를 사용하므로 외부 API 할당량 제약에서 완전히 자유롭습니다.
- **🔍 동적 IP 디스커버리 (Auto-Discovery)**: 로컬 네트워크에 배포된 Ollama 서버(SuperLLM LXC)의 IP를 자동 탐색합니다.
  - **3단계 폴백**: `.env` 고정 IP → mDNS(`superllm.local`) → 서브넷 스캔(192.168.0.x) 순으로 탐색하며, 결과를 캐싱하여 재호출 시 즉시 반환합니다.
  - **자동 복구**: 통신 실패 시 캐시를 초기화하여 다음 실행에서 재탐색을 유도합니다.
- **🎯 LLM 기반 동적 분류**: 단순 키워드를 넘어 LLM이 메일 본문의 맥락을 분석하여 **중요도(긴급/보통/낮음)**와 **후속 조치(필요/참고/무시)**를 정밀하게 판별합니다.
- **💎 프리미엄 클린 스타일 가이드**: 구글 독스 보고서에서 시각적 노이즈를 제거하고, 순수 텍스트와 개별 스타일링(색상/굵기/크기)만 사용하여 가독성을 극대화했습니다.
- **💬 텔레그램 실시간 알림**: 작업 완료 시 설정된 텔레그램 봇을 통해 소요 시간, 메일 건수, 작성된 구글 독스 보고서 링크를 전송받습니다.
- **🧠 영구 지식 관리 (`.agent`)**: 프로젝트의 핵심 아키텍처, 이슈 해결 이력, 프리미엄 가이드라인을 `.agent` 폴더에 구조화하여 에이전트의 연속성을 보장합니다.
- **🛠️ 자동화 및 유지보수**: 6개월 경과 데이터 자동 정리 및 문서 초기화 로직을 통해 보고서의 일관성을 유지합니다.

---

## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+) / Ollama llama3.2:1b (로컬 LLM - CPU 권장)
- **Notify Service**: Telegram Bot API
- **APIs**: Gmail API, Google Docs API, Google Drive API
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

- **Node.js 설치 (v18+)**
  * *LXC/Ubuntu 서버 환경의 경우*:
    ```bash
    # Node.js 20.x 설치 저장소 추가 및 패키지 설치
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
    ```
- **구글 API 인증 JSON 파일 준비 및 연동 가이드**
  - **1) `credentials.json` 발급 (GCP 콘솔)**:
    1. [구글 클라우드 콘솔](https://console.cloud.google.com/)에 접속하여 프로젝트를 생성합니다.
    2. **API 및 서비스 > 라이브러리**에서 아래 3가지 API를 각각 검색하여 **활성화**합니다:
       * **Gmail API**
       * **Google Docs API**
       * **Google Drive API**
    3. **OAuth 동의 화면** 구성:
       * User Type을 **외부(External)**로 지정하고 필수 정보를 입력합니다.
       * 테스트 사용자(Test users) 단계에서 본인의 수집 대상 구글 메일 계정을 반드시 등록해야 인증이 가능합니다.
    4. **OAuth 클라이언트 ID 발급**:
       * **사용자 인증 정보 > [사용자 인증 정보 만들기] > [OAuth 클라이언트 ID]**를 클릭합니다.
       * 애플리케이션 유형을 **데스크톱 앱(Desktop App)**으로 설정하고 생성합니다.
       * 발급 완료된 인증 정보 우측의 **[JSON 다운로드]** 버튼을 눌러 저장합니다.
       * 파일명을 `credentials.json`으로 변경하여 프로젝트 루트 디렉토리에 복사해 넣습니다.
  - **2) `token.json` 자동 생성 (최초 인증)**:
    1. `credentials.json` 복사 및 `.env` 작성을 완료한 상태에서 터미널에 `node index.js`를 최초 1회 실행합니다.
    2. 콘솔에 출력되는 긴 **구글 인증 URL**을 복사하여 브라우저 주소창에 입력해 접속합니다.
    3. 본인 구글 계정으로 로그인하고 권한 승인 동의를 진행합니다.
    4. 동의 완료 후 화면에 나오는 **Authorization Code**를 복사합니다.
    5. 터미널의 입력 창에 해당 코드를 붙여넣고 엔터를 누릅니다.
    6. 루트 경로에 `token.json`이 자동 생성되며, 이후 실행부터는 별도의 로그인 화면 없이 자동으로 인증을 마칩니다.
  - **3) 구글 독스(Google Docs) 문서 생성 및 ID 확인**:
    1. [구글 문서(Google Docs)](https://docs.google.com/)에 본인 구글 계정으로 접속합니다.
    2. 화면 우측 하단의 **[+]** 버튼(새 문서 시작)을 클릭하여 빈 문서를 새로 생성합니다.
    3. 새로 만들어진 문서의 웹 브라우저 주소창(URL)을 확인합니다.
    4. 주소는 보통 다음과 같은 형태입니다:
       `https://docs.google.com/document/d/[긴_문자열]/edit`
    5. 여기서 `/d/`와 `/edit` 사이에 위치한 **긴 영문/숫자 혼합 문자열**이 바로 **구글 독스 문서 ID**입니다.
    6. 이 ID 문자열을 복사하여 `.env` 파일의 `GOOGLE_DOC_ID` 값으로 지정해 줍니다.

- **텔레그램 봇 관리 가이드**
  - **1) 신규 봇 생성 (BotFather)**:
    1. `@BotFather` 검색 후 대화 시작
    2. `/newbot` 입력 후 가이드에 따라 이름/아이디 설정
    3. 발급된 **API Token** 복사
  - **2) 내 Chat ID 확인 (User Info Bot)**:
    1. `@userinfobot` 또는 `@get_id_bot` 검색
    2. `/start` 입력 시 출력되는 **Id** 숫자 확인
  - **3) 봇 활성화 (중요)**:
    * 봇이 메시지를 보내기 위해서는 사용자가 먼저 봇 대화방에서 **[시작]** 또는 `/start`를 전송해야 소켓 채널이 열립니다.

### 2. 설치 (Installation)
원하는 경로에서 저장소를 복사하고 의존성을 설치합니다. (LXC/서버 환경의 경우 `/opt` 등 권장 경로로 이동하여 진행)
```bash
git clone https://github.com/dicapriokim/Mail-Automation-localAI.git Mail-Automator
cd Mail-Automator
npm install
```

### 3. 환경 설정 (`.env`)
`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 다음과 같이 설정합니다:
```env
# [필수] 메일 계정
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id

# [필수] 텔레그램 알림
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# [선택] 로컬 AI 서버 (Ollama) - 미설정 시 mDNS/서브넷 스캔으로 자동 탐색
LOCAL_AI_IP=192.168.0.100
```
*GCP 콘솔에서 발급받은 `credentials.json`과 최초 인증으로 생성되는 `token.json`도 동일한 프로젝트 루트 경로에 위치해야 합니다. (서버/LXC 환경의 경우 로컬에서 생성한 파일들을 해당 경로로 복사하여 사용 가능)*

### 4. 실행 및 자동화 (Execution & Automation)

#### 1) 수동 즉시 실행
```bash
node index.js
```

#### 2) LXC/서버 환경 크론탭(Crontab) 자동화
매일 정해진 시간(예: 매일 오전 9시 정각)에 메일 비서가 자동으로 메일을 수집하고 보고서를 작성하도록 시스템 크론을 구성합니다.
```bash
crontab -e
```
설정 최하단에 아래 실행 행을 추가하고 저장합니다 (Node.js 실행 절대경로 및 프로젝트 경로를 자신의 환경에 맞게 지정):
```cron
00 09 * * * cd /opt/Mail-Automator && /usr/bin/node index.js >> /opt/Mail-Automator/cron.log 2>&1
```

---

## 📊 보고서 예시 (Sample Report)

V5 스타일링(수평선 배제, 유니코드 화살표 적용, 긴급 메일 적색 스타일링 등)이 적용된 최종 보고서 형태입니다:

> **[2026년 4월 3주차] 요약 보고서**
> 
> **### 📧 Gmail**
> 
> **[2026. 4. 16.] OpenAI | GPT-4o 업데이트 소식**
>     ➔ 핵심 요약: 범용 인공지능 성능 향상 및 멀티모달 기능 강화에 대한 공지입니다.
>     ➔ 후속 조치: [참고]
> 
> **[2026. 4. 16.] Toss | 주간 경제 지표** *(실제 문서에서는 긴급에 따라 빨간색 텍스트 서식 적용)*
>     ➔ 핵심 요약: 금리 변동성에 따른 긴급 브리핑 자료로 즉각적인 확인이 권장됩니다.
>     ➔ 후속 조치: [필요]
> 
> **📊 금주 정리 통계**
> Gmail: 12건 삭제 (예: 광고성 프로모션, 보안 경고 등)
> Naver: 8건 삭제 (예: 쇼핑몰 수신동의 확인 등)
> 작업 결과: 핵심 뉴스레터 및 주문/배송 관련 메일 12건 정규화 완료

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
