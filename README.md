# 🚀 Antigravity Mail Local (Mail-Automator Local)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker Support](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)

**Antigravity Mail Local**은 지메일(Gmail)과 네이버 메일(Naver Mail)의 수많은 뉴스레터를 자동으로 수집, 요약하여 구글 독스(Google Docs) 보고서로 정리하고 텔레그램(Telegram) 봇으로 작업 완료 알림을 즉시 전송하는 스마트 메일 비서 시스템입니다. 본 프로젝트는 외부 클라우드 의존성 없이 **로컬 LLM 서버(LocalAI)** 및 **Docker**를 사용하여 프라이버시를 강화하고 자원 효율을 극대화하도록 최적화되었습니다.

## 🌟 주요 특징 (Key Features)

- **📧 멀티 채널 메일 통합**: Gmail API 및 Naver IMAP을 지원하여 분산된 메일을 한곳에 모읍니다.
- **🧠 로컬 AI 엔진 (LocalAI)**: OpenAI와 호환되는 로컬 AI 엔진 표준 규격 및 경량 로컬 AI 모델(**qwen-1.5b**)을 사용하여 데이터를 안전하고 비용 효율적으로 처리합니다.
- **🐳 Docker 및 Docker Compose 지원**: 애플리케이션 실행 환경을 컨테이너로 격리하여 1회 실행 후 자동 소멸 구조로 리소스 낭비를 차단합니다.
- **🏗️ Batch Fetch & Close 아키텍처**: IMAP 메일을 배치 수집 후 즉시 연결을 종료하여 추론 지연으로 인한 ECONNRESET을 원천 차단합니다.
- **📊 Performance Profile**: 총 소요 시간 및 처리 건수를 자동 측정하여 터미널 로그 및 텔레그램으로 보고합니다.
- **📬 텔레그램 봇 알림**: 작업 완료 후 소요 시간, 처리 건수, 구글 독스 바로가기 링크를 마크다운 서식으로 즉시 알림합니다.
- **🛡️ 시스템 안정성 및 방어 설계**: 
  - **120초 타임아웃**: `AbortController`를 통한 추론 지연 방지.
  - **JSON 파싱 예외 처리**: LLM 응답 텍스트에 마크다운 블록이 포함되어 있어도 정상 파싱하는 견고한 예외 방어 구현.
  - **오류 격리(Isolation)**: 개별 요약 실패 시에도 전체 프로세스를 보호하는 Fallback 로직.
- **🧹 지능형 클린업 (Auto-Cleanup)**: 광고성 프로모션, 불필요한 알림 등을 자동으로 감지하여 휴지통으로 이동시켜 편지함을 쾌적하게 유지합니다.
- **💎 프리미엄 클린 스타일 가이드**: 구글 독스 보고서에서 시각적 노이즈를 제거하고 가독성을 극대화한 전용 서식을 적용합니다.
- **🕐 문서 무결성 관리**: 모든 보고서 하단에 KST 기준 최종 작성 일시를 **프리미엄 우측 정렬 스타일(9PT, 이탤릭, 회색)**로 자동 삽입하여 문서의 전문성과 이력 추적성을 높였습니다.

---

### 📊 구글 독스 보고서 생성 예시 (Report Preview)
이 프로그램이 자동 실행되면, 설정해 둔 구글 독스 문서에 아래와 같은 프리미엄 클린 스타일 서식의 문서가 자동으로 작성됩니다.

```text
# Weekly Newsletter Summary

## [2026년 5월 4주차] 요약 보고서

### 📧 Gmail

[2026-05-29] GitHub | [Security Alert] New login from Chrome on Windows
    ➔ 핵심 요약: 새로운 Windows 환경의 Chrome 브라우저에서 GitHub 계정 로그인이 감지되었습니다.
    ➔ 후속 조치: [필요]  (※ 긴급 메일은 구글 문서에 빨간색으로 자동 강조 표시됩니다.)

[2026-05-29] YouTube | 새로운 기능 알림: 스마트 자막 기능이 추가되었습니다
    ➔ 핵심 요약: 유튜브에 스마트 자막 기술이 새로 도입되었다는 업데이트 안내입니다.
    ➔ 후속 조치: [참고]

### 📗 Naver Mail

[2026-05-29] 네이버페이 | 결제하신 내역을 확인해 주세요
    ➔ 핵심 요약: 등록된 수단을 통해 네이버페이 결제가 성공적으로 처리되었습니다.
    ➔ 후속 조치: [참고]

[2026-05-29] [하프클럽] 광고성 정보 수신동의 안내
    ➔ 핵심 요약: 정기 수신동의 상태 확인 알림으로 자동 정적 필터링 처리되었습니다.
    ➔ 후속 조치: [불필요]

📊 금주 정리 통계
- Gmail: 3건 삭제 (예: AliExpress 프로모션 메일 등 광고성 메일 자동 휴지통 이동)
- Naver: 0건 삭제
- 작업 결과: 핵심 뉴스레터 및 주문/배송 관련 메일 4건 정규화 완료

                                              최종 작성 일시: 2026-05-29 17:42:18 (KST)
```


## 🛠 기술 스택 (Tech Stack)

- **Main Engine**: Node.js (v18+) / Docker (Alpine Linux)
- **AI Model**: LocalAI / qwen-1.5b (OpenAI Chat Completions API 호환)
- **Notify Service**: Telegram Bot API
- **APIs**: Gmail API, Google Docs API, Google Drive API
- **Protocols**: IMAP (for Naver Mail)
- **Architecture**: Batch Fetch & Close (IMAP Idle Timeout 방지)

## 🔄 LLM 모델 교체 (Model Swap)

별도의 소스 코드 빌드 없이 **`.env` 설정 수정만으로** 사용 모델을 즉시 변경할 수 있도록 환경 변수 제어를 지원합니다.

```env
# .env 파일 내 설정
LLM_MODEL=사용할_모델_이름 (예: qwen-1.5b)
```

* **참고**: `.env` 파일에 `LLM_MODEL` 변수를 기재하지 않거나 생략하는 경우, 기본 빌드 사양인 **`qwen-1.5b` 모델**로 자동 작동합니다.



## 🔑 사전 연동 설정 가이드 (Integration Setup Guide)

### 1. 네이버 메일 연동 준비
네이버 메일 데이터를 외부 프로그램이 IMAP 프로토콜로 안전하게 읽어올 수 있도록 아래의 두 가지 설정을 완료해야 합니다.

1. **IMAP 사용 허용**:
   * 네이버 메일(웹)에 접속합니다.
   * 왼쪽 사이드바 맨 하단의 **환경설정** (톱니바퀴)을 클릭합니다.
   * 상단 탭에서 **POP3/IMAP 설정** ➡️ **IMAP/SMTP 설정**으로 이동합니다.
   * **IMAP/SMTP 연결** 항목에서 **'사용함'**을 선택한 뒤 저장합니다.
2. **애플리케이션 비밀번호 발급 (2단계 인증 사용자 필수)**:
   * 네이버 로그인 후 **네이버 ID** 설정으로 이동합니다.
   * **보안설정** ➡️ **비밀번호** ➡️ **2단계 인증** 관리 화면으로 이동합니다.
   * **애플리케이션 비밀번호** 항목에서 종류를 `기타`로 선택하고 생성 버튼을 누릅니다.
   * 화면에 발급된 **12자리 영문 대문자 애플리케이션 비밀번호**를 복사하여 `.env` 파일의 `NAVER_PW`에 입력합니다. (기존 로그인 비밀번호로는 외부 연동 로그인이 차단됩니다.)

### 2. 구글 API 권한 및 자격 증명(credentials.json) 발급
Gmail 및 Google Docs API에 안전하게 연결하기 위한 구글 클라우드 자격 증명을 획득해야 합니다.

1. **Google Cloud 프로젝트 생성**:
   * [Google Cloud Console](https://console.cloud.google.com/)에 구글 계정으로 로그인하고 새 프로젝트를 생성합니다.
2. **필수 API 활성화**:
   * 프로젝트 상단 검색창에 아래의 API를 각각 검색하여 들어가 **활성화(Enable)** 버튼을 클릭합니다.
     * `Gmail API`
     * `Google Docs API`
     * `Google Drive API`
3. **OAuth 동의 화면(Consent Screen) 설정**:
   * API 및 서비스 메뉴 ➡️ **OAuth 동의 화면**으로 이동합니다.
   * User Type을 **External(외부)**로 선택하고 앱 이름과 이메일을 적어 저장합니다.
   * 테스트 사용자(Test Users) 등록 단계에서 메일을 수집하고 보고서를 작성할 **자신의 구글 이메일 주소**를 반드시 추가해 줍니다.
4. **자격 증명(credentials.json) 다운로드**:
   * **사용자 자격 증명** 메뉴 ➡️ **사용자 자격 증명 만들기** ➡️ **OAuth 클라이언트 ID**를 클릭합니다.
   * 애플리케이션 유형을 **데스크톱 앱(Desktop App)**으로 선택하고 생성합니다.
   * 생성된 자격 증명을 JSON 파일로 다운로드하고 파일명을 **`credentials.json`**으로 변경하여 메일 요약기 프로젝트 폴더 루트 디렉토리에 복사해 넣습니다.
5. **최초 1회 실행을 통한 토큰(token.json) 생성 및 구글 경고 우회**:
   * 노트북 터미널(CMD/파워쉘)에서 `node index.js`를 처음 실행하면, 웹 브라우저 로그인 창이 자동으로 열리거나 인증 링크 주소가 터미널에 표시됩니다.
   * 위 테스트 사용자에 추가했던 구글 계정으로 로그인하여 권한을 허용해 줍니다.
   * **⚠️ 중요 (경고창 통과 방법)**: 개인적으로 개발한 앱이므로 로그인 중 **"이 앱은 Google의 확인을 받지 않았습니다(This app isn't verified)"**라는 경고 화면이 반드시 나타납니다. 
     * 당황하지 마시고 좌측 하단의 **'고급(Advanced)'** 링크를 클릭합니다.
     * 이어서 아래에 나타나는 **'Antigravity(으)로 이동(안전하지 않음) / Go to Antigravity (unsafe)'** 버튼을 클릭하여 권한 승인을 진행하시면 됩니다.
   * 인증이 완료되면 프로젝트 폴더 내부에 **`token.json`** 파일이 자동으로 생성되어 이후 로그인 과정 없이 비서가 매일 아침 구글에 자동 로그인할 수 있게 됩니다.


## 🚀 시작하기 (Getting Started)

### 1. 전제 조건
- Node.js (v18+) 또는 Docker 설치 완료
- **LocalAI 서버 구축**: LocalAI는 외부 클라우드 통신 없이 로컬 환경에서 OpenAI API와 동일한 규격의 엔드포인트를 제공하는 경량 자율형 AI 서버 엔진입니다. 다음 단계로 넘어가기 전, [LocalAI-miniPC 저장소](https://github.com/dicapriokim/LocalAI-miniPC)의 안내에 따라 로컬 AI 서버를 먼저 구축하고 `qwen-1.5b` 등의 텍스트 모델 로드를 마쳐야 합니다.
- Google Cloud Console에서 API 권한 설정 (`credentials.json`) 및 브라우저를 통한 Google 토큰 정보(`token.json`) 발급 완료
- Telegram BotFather를 통해 봇 토큰 발급

### 2. 설치
```bash
git clone https://github.com/dicapriokim/Mail-Automation-localAI.git
cd Mail-Automation-localAI
```

### 3. 환경 설정 (`.env`)
프로젝트 루트 폴더에 `.env` 파일을 생성하고 설정을 입력합니다.

```env
LOCALAI_API_URL=http://your_localai_ip:8080/v1/chat/completions
LLM_MODEL=qwen-1.5b
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

| 변수 | 설명 |
|------|------|
| `LOCALAI_API_URL` | LocalAI-miniPC (본문 전제 조건 설명 참조) 안내에 따라 설치한 로컬 AI 서버의 API 주소 (예: `http://192.168.0.33:8080/v1/chat/completions`) |
| `LLM_MODEL` | LocalAI에 구동 등록된 모델 식별 이름 (생략 시 기본값: `qwen-1.5b`) |
| `NAVER_ID` / `NAVER_PW` | 네이버(www.naver.com) 사이트 계정의 아이디/비밀번호 |
| `GOOGLE_DOC_ID` | 보고서를 기록할 구글 독스 문서 ID (상세 확인 방법은 아래 설명 참조) |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 API 토큰 (텔레그램 검색창에 `@BotFather`를 검색한 후 대화방에서 `/newbot` 명령어를 실행하여 발급 가능) |
| `TELEGRAM_CHAT_ID` | 알림을 수신할 텔레그램 고유 숫자 ID (텔레그램 검색창에 `@userinfobot` 또는 `@GetMyChatID_Bot`을 검색하여 대화방을 시작하면 본인의 숫자 ID를 즉시 확인 가능) |

> 💡 **구글 문서 ID(GOOGLE_DOC_ID) 확인 방법**:
> 구글 문서를 화면에 열어둔 상태에서 상단 주소창을 보면 아래와 같은 규칙적인 구조를 가지고 있습니다.
> 
> * **구글 문서 URL 구조 예시**:
>   `https://docs.google.com/document/d/1A2B3C4D5E6F7G8H9I0J_abc123XYZ/edit`
> 
> 여기서 `d/` 바로 뒤부터 시작해서 다음 슬래시인 `/edit` 전까지 위치한 `1A2B3C4D5E6F7G8H9I0J_abc123XYZ` 형태의 긴 무작위 문자열이 바로 해당 문서의 고유 ID(Document ID)입니다.


---

### 4. 실행 방식 선택 (Execution)

#### 방법 A: 일반 로컬 구동 (CMD/파워셀에서 실행)
```bash
npm install
node index.js
```
*(윈도우 환경에서는 미리 구성된 `run_automator.bat` 파일을 더블 클릭하여 실행할 수도 있습니다.)*

#### 방법 B: Docker 컨테이너 구동 (서버/LXC 환경 권장)
```bash
# 이미지 빌드
docker compose build

# 1회성 구동 테스트
docker compose up
```

---

## 📅 서버 자동 스케줄러 등록 (LXC/리눅스)

매일 정기적으로 요약 비서를 구동하고 싶다면, 크론탭(`crontab -e`) 설정을 열어 아래의 크론 규칙을 등록합니다. (아래 설정은 매일 오후 3시 10분에 동작하며 실행 완료 후 도커가 자동 정제 및 소멸되는 설정입니다.)

```cron
10 15 * * * cd /opt/Mail-Automator && /usr/bin/docker compose run --rm mail-automator >> /opt/Mail-Automator/cron.log 2>&1
```

---

## ⚠️ 주의 사항 (Troubleshooting)

1. **보안 파일 격리**: `token.json`, `credentials.json`, `.env` 파일은 민감한 기밀 정보가 담겨있으므로 배포 저장소에 포함되지 않고 `.gitignore` 및 `.dockerignore`에 의해 엄격히 차단됩니다.
2. **도커 볼륨 마운트**: 컨테이너 구동 방식 사용 시 보안 인증서와 설정을 이미지 외부에 유지하기 위해 파일들이 호스트 디렉토리에 마운트되어 제공됩니다.
3. **IMAP 연결 안전성**: Batch Fetch & Close 패턴을 적용하여 LLM 추론 지연 중 IMAP Idle Timeout(ECONNRESET)을 원천 차단합니다.

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.

### 👑 Developer
- **돼지지렁이** (Antigravity Developer)
