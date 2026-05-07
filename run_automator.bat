@echo off
title 안티 그래비티 - 메일 요약 비서 (노트북 버전)

echo ==========================================
echo    비서가 메일을 읽고 요약을 시작합니다...
echo ==========================================
echo.

:: 0. 필수 파일 체크
if not exist "token.json" (
    echo [경고] token.json 파일이 없습니다! 
    echo 브라우저 인증이 필요하거나 파일 복사가 필요합니다.
    goto error
)
if not exist ".env" (
    echo [경고] .env 설정 파일이 없습니다!
    goto error
)

:: 1. Node.js 실행 (메일 가져오기 및 요약)
echo [1/2] 메일 분석 중...
node src/summarize.js

:: 2. Python 실행 (카카오톡 알림 전송)
echo.
echo [2/2] 카카오톡 메시지 전송 중...
python send_kakao.py "돼지지렁이님, 노트북에서 요청하신 메일 요약이 완료되었습니다! 🚀"

echo.
echo ==========================================
echo ✅ 모든 작업이 무결하게 완료되었습니다.
echo ==========================================
goto end

:error
echo.
echo ❌ 필수 파일이 누락되어 작업을 중단합니다.
echo 로컬 환경 설정을 다시 확인해 주세요.
echo.

:end
pause