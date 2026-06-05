# 📝 Troubleshooting & Session History

## 📌 핵심 운영 원칙 및 기준 폴더
- **기준 작업 폴더**: `d:\Antigravity\Workspace\Mail-Automator_gemma4`
- **원격 저장소**: `https://github.com/dicapriokim/Mail-Automation-localAI.git`
- **중요 지침**: Mail-Automator 프로젝트의 모든 작업, 검수, 커밋 및 배포의 기본 대상은 `Mail-Automator` 폴더가 아니라 **`Mail-Automator_gemma4`** 폴더입니다. 향후 에이전트는 혼동 없이 반드시 이 폴더를 기준으로 작업을 수행해야 합니다.

---

## 📅 세션 이력 (Session History)

### 2026-06-04 ~ 2026-06-05 세션 (Ollama 마이그레이션 완료)
- **수행 작업**:
  1. **LLM 백엔드 전환**: 기존 외부 Google Gemini Cloud API 의존성을 100% 제거하고, 로컬 Proxmox LXC 환경의 Ollama (`qwen2.5:3b`) 내장 OpenAI 호환 API(`http://[IP]:11434/v1/chat/completions`)로 마이그레이션을 완료했습니다.
  2. **동적 IP 디스커버리 탑재**:
     - `.env`에 등록된 고정 IP 우선 탐색.
     - 실패 시 mDNS (`superllm.local`) 탐색.
     - 실패 시 C클래스 사설 서브넷 스캔(192.168.0.x)을 통한 11434 포트 탐색.
     - 최종 실패 시 `127.0.0.1` 루프백 폴백.
     - 결과 캐싱 및 연결 오류 발생 시 캐시 리셋 로직 반영.
  3. **문서 및 설정 정비**:
     - `README.md`에 Proxmox LXC 올인원 구축 가이드 링크 및 단일 vs 분리 운영 장단점 구성 팁 추가.
     - `.gitignore`에 보안 강화를 위한 임시 백업(`*_bak`, `*.bak`, `*output.txt`) 패턴 등록.
     - `.env.example`에 `LOCAL_AI_IP` 추가 및 사용하지 않는 Gemini API Key 예시 항목 제거.
     - `.agent` 프로젝트 지식 및 스킬북 동기화 완료.
- **성공 단계**:
  - `Mail-Automator_gemma4` 폴더에 최종 마이그레이션 코드를 성공적으로 이식 및 검증 완료.
  - `Mail-Automation-localAI.git` 원격 저장소의 `main` 브랜치로 푸시 완료.
- **특이 사항**:
  - 로컬에 유사한 이름의 `Mail-Automator` 폴더가 있어 이전 에이전트들의 경로 판단에 혼선이 있었으나, 현재 기준 폴더를 `Mail-Automator_gemma4`로 명확히 단일화하여 문서 및 환경을 모두 동기화 완료했습니다.

### 2026-06-06 세션 (카카오 잔재 청산 및 텔레그램 가이드 보완)
- **수행 작업**:
  1. **카카오 잔재 완벽 청산**: README.md, .gitignore, .env.example에서 불필요한 카카오톡 알림 관련 기술 스택 설명, Python 의존성(pip install) 가이드, 및 kakao_token.json 설정을 완전히 제거했습니다.
  2. **구글 자격증명 가이드 보완**: README.md에 credentials.json 발급 프로세스(Gmail, Docs, Drive API 활성화 및 데스크톱 앱 클라이언트 ID 다운로드)와 	oken.json 최초 자동 생성 프로세스(Authorization Code 입력)의 상세 가이드를 보완 작성했습니다.
  3. **구글 독스 출력 서식 동기화**: src/summarize.js 내 정리 통계 블록의 글머리 기호 -를 구글 독스 포맷 규정에 맞게 제거(순수 텍스트 줄바꿈 형태로 정규화)하여 스타일 일관성을 확보했습니다.
- **성공 단계**:
  - Mail-Automator_gemma4 기준 폴더의 모든 변경 사항을 원격 저장소(origin/main)에 푸시 완료.
- **특이 사항**:
  - src/cleanup.js의 rom:kakao 조건은 스팸 메일 오탐지 방지 목적의 정상 필터 로직이므로 검수 결과 의도적으로 유지(수정 제외)했습니다.
