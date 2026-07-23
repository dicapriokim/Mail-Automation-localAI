const { authorize } = require('./src/auth');
const { cleanupGmail, cleanupNaver } = require('./src/cleanup');
const { fetchGmailSummaries, fetchNaverSummaries, appendToDocs, clearDocContents, cleanupOldReports } = require('./src/summarize');
const { routeNotification } = require('./src/notificationRouter');
const { AIFactory } = require('./src/aiProvider');
require('dotenv').config();

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
        // Performance Profile 측정 및 알림
        const endTime = Date.now();
        const elapsed = endTime - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const provider = process.env.AI_PROVIDER || 'OLLAMA';
        const model = provider === 'OLLAMA' ? (process.env.OLLAMA_MODEL || 'qwen2.5:3b') 
                    : provider === 'GEMINI' ? (process.env.GEMINI_MODEL || 'gemini-3.6-flash') 
                    : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
        const tokenUsage = AIFactory.getTokenUsage();
        
        console.log(`\n[Performance] 총 소요 시간: ${minutes}분 ${seconds}초`);
        console.log(`[Performance] 처리 건수: ${totalProcessed}건`);
        console.log(`[Performance] 사용 AI 공급자: ${provider} (모델: ${model})`);
        if (tokenUsage && tokenUsage.totalTokens > 0) {
            console.log(`[Performance] 소모 토큰량: 총 ${tokenUsage.totalTokens.toLocaleString()} 토큰 (입력: ${tokenUsage.promptTokens.toLocaleString()} / 출력: ${tokenUsage.completionTokens.toLocaleString()})`);
        } else {
            console.log(`[Performance] 소모 토큰량: 0 토큰 (정적 필터링 바이패스됨)`);
        }

        // 알림 라우터를 호출하여 다중 채널 알림 발송
        await routeNotification({ minutes, seconds, totalMails: totalProcessed, docId });
    }
}

main();
