@chcp 65001 >nul
@echo off
title 안티 그래비티 - 메일 요약 비서 (노트북 버전)

echo ==========================================
echo    비서가 메일을 읽고 요약을 시작합니다...
echo ==========================================
echo.

REM 0. 필수 파일 체크
if not exist "token.json" (
    echo [경고] token.json 파일이 없습니다! 
    echo 브라우저 인증이 필요하거나 파일 복사가 필요합니다.
    goto error
)
if not exist ".env" (
    echo [경고] .env 설정 파일이 없습니다!
    goto error
)

REM 1. Node.js 실행 (메일 분석 및 요약)
echo [실행] 메일 분석 중...
node index.js

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
