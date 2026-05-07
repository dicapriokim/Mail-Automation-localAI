#!/bin/bash

# --- [안티 그래비티 에이전트 메인 실행 스크립트] ---

# 1. 프로젝트 폴더로 이동 (경로가 다를 경우 수정 필요)
cd /opt/Mail-Automator || exit

# 2. 필수 파일 체크 (무한 대기 방지)
MISSING_FILES=()
[ ! -f "token.json" ] && MISSING_FILES+=("token.json")
[ ! -f "credentials.json" ] && MISSING_FILES+=("credentials.json")
[ ! -f ".env" ] && MISSING_FILES+=(".env")

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo "⚠️  [경고] 필수 파일이 누락되었습니다: ${MISSING_FILES[*]}"
    echo "로컬 PC에서 위 파일들을 서버의 /opt/Mail-Automator 경로로 복사해 주세요."
    echo "또는 'npm run auth'를 실행하여 새 토큰을 생성하세요."
    exit 1
fi

# 3. 메일 요약 프로세스 실행 (Node.js)
echo "--- [1/2] 메일 요약 프로세스 시작 ---"
npm run summarize

# 4. 카카오톡 알림 전송 (Python)
echo "--- [2/2] 카카오톡 알림 전송 ---"
python3 send_kakao.py "돼지지렁이님, 서버에서 요청하신 메일 요약 보고서가 생성되었습니다. 📧"

echo "--- [완료] 모든 자동화 작업이 끝났습니다 ---"
