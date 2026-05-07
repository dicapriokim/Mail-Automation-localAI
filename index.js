const { authorize } = require('./src/auth');
const { cleanupGmail, cleanupNaver } = require('./src/cleanup');
const { fetchGmailSummaries, fetchNaverSummaries, appendToDocs, clearDocContents, cleanupOldReports } = require('./src/summarize');

async function main() {
    console.log('--- Mail Automator V5 [API Mode] Starting ---');

    try {
        const auth = await authorize();
        console.log('[Auth] Google API 인증 성공');

        // 1. Cleanup
        console.log('[Step 1] 클린업 시작...');
        const gmailDeleted = await cleanupGmail(auth);
        const naverDeleted = await cleanupNaver();

        const docId = process.env.GOOGLE_DOC_ID;
        if (!docId) throw new Error("GOOGLE_DOC_ID가 설정되지 않았습니다.");

        // 2. Document Initialization & Cleanup
        console.log('[Step 1.5] 문서 초기화 및 오래된 보고서 정리 중...');
        await clearDocContents(auth, docId);
        await cleanupOldReports(auth, docId);

        // 3. Summarize
        console.log('[Step 2] 요약 및 기록 시작...');
        const gmailSummaries = await fetchGmailSummaries(auth);
        const naverSummaries = await fetchNaverSummaries();

        await appendToDocs(auth, docId, gmailSummaries, naverSummaries, {
            gmail: { count: gmailDeleted.count, details: gmailDeleted.details },
            naver: { count: naverDeleted.count, details: naverDeleted.details }
        });

        // 3. KakaoTalk Notification
        console.log('[Step 3] 카카오톡 알림 전송 중...');
        const { exec } = require('child_process');

        // [무결성 포인트] OS를 감지하여 윈도우는 python, 리눅스는 python3를 자동으로 선택
        const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
        const message = "안티 그래비티 비서가 요청하신 메일 요약을 완료했습니다! 🚀";

        // 명령어를 템플릿 리터럴로 유연하게 구성
        const pythonCmd = `${pythonExe} send_kakao.py "${message}"`;

        await new Promise((resolve) => {
            exec(pythonCmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Kakao Error] ${error.message}`);
                    // [무결성 유지] 카톡 전송 실패가 전체 프로세스를 죽이지 않도록 resolve 처리
                    return resolve();
                }
                if (stderr) console.log(`[Kakao Info] ${stderr}`);
                console.log(`[Kakao] ${stdout.trim()}`);
                resolve();
            });
        });

        console.log('--- 모든 작업이 백그라운드에서 완료되었습니다 ---');
    } catch (err) {
        console.error('[Error]', err.message);
        if (err.message.includes('credentials.json')) {
            console.log('!! credentials.json 파일이 누락되었거나 형식이 잘못되었습니다.');
        }
    }
}

main();
