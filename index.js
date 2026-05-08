const { authorize } = require('./src/auth');
const { cleanupGmail, cleanupNaver } = require('./src/cleanup');
const { fetchGmailSummaries, fetchNaverSummaries, appendToDocs, clearDocContents, cleanupOldReports } = require('./src/summarize');
require('dotenv').config();

/**
 * 텔레그램 봇 알림 발송 함수 (Markdown 서식 및 구글 독스 링크 포함)
 * - 환경변수 미설정 또는 통신 실패 시 로그만 남기고 메인 프로세스에 영향 없음
 */
async function sendTelegramNotification(minutes, seconds, totalMails, docId) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!botToken || !chatId) {
            console.log('[Telegram] BOT_TOKEN 또는 CHAT_ID가 설정되지 않아 알림을 건너뜁니다.');
            return;
        }

        // 메시지 구성 (Markdown)
        let message = `✅ *[메일 요약 완료]*\n\n` +
            `• 처리 건수: ${totalMails}건\n` +
            `• 소요 시간: ${minutes}분 ${seconds}초\n\n`;

        if (docId) {
            const docsUrl = `https://docs.google.com/document/d/${docId}/edit`;
            message += `📎 [구글 독스 바로가기](${docsUrl})`;
        } else {
            message += `⚠️ _구글 독스 ID를 찾을 수 없어 링크를 생성하지 못했습니다._`;
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            })
        });

        if (response.ok) {
            console.log('[Telegram] 알림 전송 성공');
        } else {
            const errorData = await response.json();
            console.error(`[Telegram Error] ${response.status}: ${errorData.description}`);
        }
    } catch (err) {
        console.error(`[Telegram Error] 통신 실패: ${err.message}`);
    }
}

async function main() {
    console.log('--- Mail Automator V5 [API Mode] Starting ---');

    const startTime = Date.now();
    let totalProcessed = 0;
    const docId = process.env.GOOGLE_DOC_ID;

    try {
        const auth = await authorize();
        console.log('[Auth] Google API 인증 성공');

        // 1. Cleanup
        console.log('[Step 1] 클린업 시작...');
        const gmailDeleted = await cleanupGmail(auth);
        const naverDeleted = await cleanupNaver();

        if (!docId) throw new Error("GOOGLE_DOC_ID가 설정되지 않았습니다.");

        // 2. Document Initialization & Cleanup
        console.log('[Step 1.5] 문서 초기화 및 오래된 보고서 정리 중...');
        await clearDocContents(auth, docId);
        await cleanupOldReports(auth, docId);

        // 3. Summarize
        console.log('[Step 2] 요약 및 기록 시작...');
        const gmailSummaries = await fetchGmailSummaries(auth);
        const naverSummaries = await fetchNaverSummaries();

        totalProcessed = gmailSummaries.length + (naverSummaries || []).length;

        await appendToDocs(auth, docId, gmailSummaries, naverSummaries, {
            gmail: { count: gmailDeleted.count, details: gmailDeleted.details },
            naver: { count: naverDeleted.count, details: naverDeleted.details }
        });

        console.log('--- 모든 작업이 완료되었습니다 ---');
    } catch (err) {
        console.error('[Error]', err.message);
        if (err.message.includes('credentials.json')) {
            console.log('!! credentials.json 파일이 누락되었거나 형식이 잘못되었습니다.');
        }
    } finally {
        // Performance Profile 측정 및 텔레그램 알림
        const endTime = Date.now();
        const elapsed = endTime - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        console.log(`\n[Performance] 총 소요 시간: ${minutes}분 ${seconds}초`);
        console.log(`[Performance] 처리 건수: ${totalProcessed}건`);

        // 텔레그램 알림 전송 (구글 독스 링크 포함)
        await sendTelegramNotification(minutes, seconds, totalProcessed, docId);
    }
}

main();
