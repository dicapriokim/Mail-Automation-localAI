const { authorize } = require('./src/auth');
const { cleanupGmail, cleanupNaver } = require('./src/cleanup');
const { fetchGmailSummaries, fetchNaverSummaries, appendToDocs, clearDocContents, cleanupOldReports } = require('./src/summarize');
require('dotenv').config();

const https = require('https');

// 엔터프라이즈 수준의 커넥션 풀링을 위한 HTTPS Agent 설정
const telegramHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 10,
    maxFreeSockets: 5,
    scheduling: 'lifo',
    timeout: 10000 // 소켓 유휴 타임아웃
});

/**
 * 텔레그램 봇 알림 발송 함수 (https 모듈 기반 엔터프라이즈 사양)
 */
async function sendTelegramNotification(minutes, seconds, totalMails, docId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.log('[Telegram] BOT_TOKEN 또는 CHAT_ID가 설정되지 않아 알림을 건너뜁니다.');
        return;
    }

    // 메시지 구성 (Markdown)
    const usedModel = process.env.OLLAMA_MODEL || 'llama3.2:1b';
    let message = `✅ *[메일 요약 완료]*\n\n` +
        `• 처리 건수: ${totalMails}건\n` +
        `• 소요 시간: ${minutes}분 ${seconds}초\n` +
        `• 사용 모델: \`${usedModel}\`\n\n`;

    if (docId) {
        const docsUrl = `https://docs.google.com/document/d/${docId}/edit`;
        message += `📎 [구글 독스 바로가기](${docsUrl})`;
    } else {
        message += `⚠️ _구글 독스 ID를 찾을 수 없어 링크를 생성하지 못했습니다._`;
    }

    const payload = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        },
        agent: telegramHttpsAgent,
        minVersion: 'TLSv1.2', // 보안: TLS v1.2 이상 규격 준수
        family: 4,            // DNS 조회 및 커넥션을 IPv4(A 레코드)로 강제 지정 (LXC IPv6 장애 방지)
        timeout: 5000         // 하드웨어 연결 타임아웃: 5초
    };

    return new Promise((resolve) => {
        let timer = null;

        const req = https.request(options, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (timer) clearTimeout(timer);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('[Telegram] 알림 전송 성공');
                } else {
                    console.error(`[Telegram Error] 상태 코드: ${res.statusCode}, 응답: ${body}`);
                }
                resolve();
            });
        });

        // 타임아웃 발생 시 강제 리소스 회수 로직
        timer = setTimeout(() => {
            console.error('[Telegram Error] 요청 시간 초과 (5초). 연결을 중단하고 자원을 회수합니다.');
            req.destroy();
            resolve();
        }, 5000);

        req.on('error', (err) => {
            if (timer) clearTimeout(timer);
            console.error(`[Telegram Error] 통신 실패 상세:`, err);
            resolve();
        });

        req.write(payload);
        req.end();
    });
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
        const usedModel = process.env.OLLAMA_MODEL || 'llama3.2:1b';
        console.log(`\n[Performance] 총 소요 시간: ${minutes}분 ${seconds}초`);
        console.log(`[Performance] 처리 건수: ${totalProcessed}건`);
        console.log(`[Performance] 사용 모델: ${usedModel}`);

        // 텔레그램 알림 전송 (구글 독스 링크 포함)
        await sendTelegramNotification(minutes, seconds, totalProcessed, docId);
    }
}

main();
