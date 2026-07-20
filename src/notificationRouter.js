const https = require('https');
const http = require('http');
require('dotenv').config();

console.log('[진행 내용] notificationRouter.js 로드 완료. 다중 알림 채널 구조를 설정합니다.');

// HTTPS Keep-Alive 에이전트 (Telegram API 용)
const telegramHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 5,
    timeout: 10000
});

// Home Assistant 프로토콜 분기용 HTTP/HTTPS 에이전트 설정
const haHttpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 10000 });
const haHttpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 10000 });

// 1. 텔레그램 발송 기능 (기존 텔레그램 발송 함수의 무결성 온전하게 이관/보존)
async function sendTelegram(text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        console.log('[Telegram] BOT_TOKEN 또는 CHAT_ID 누락으로 발송 생략.');
        return;
    }

    const payload = JSON.stringify({
        chat_id: chatId,
        text: text,
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
        minVersion: 'TLSv1.2',
        family: 4,
        timeout: 5000 // 5초 강제 타임아웃
    };

    return new Promise((resolve) => {
        let timer = setTimeout(() => {
            console.error('[Telegram Error] 전송 시간 초과 (5초). 연결 해제.');
            req.destroy();
            resolve();
        }, 5000);

        const req = https.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                clearTimeout(timer);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('[Telegram] 알림 전송 완료');
                } else {
                    console.error(`[Telegram Error] HTTP 상태코드: ${res.statusCode}`);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            clearTimeout(timer);
            console.error('[Telegram Error] 통신 예외:', err.message);
            resolve();
        });

        req.write(payload);
        req.end();
    });
}

// 2. Home Assistant 모바일 앱 푸시 알림 발송 기능
async function sendHomeAssistant(title, text) {
    const haUrl = process.env.HA_URL || 'http://homeassistant.local:8123';
    const token = process.env.HA_TOKEN;
    const deviceId = process.env.HA_MOBILE_ENTITY;

    if (!token || !deviceId) {
        console.log('[Home Assistant] HA_TOKEN 또는 HA_MOBILE_ENTITY 누락으로 발송 생략.');
        return;
    }

    const urlObj = new URL(haUrl);
    const isHttps = urlObj.protocol === 'https:';
    const payload = JSON.stringify({
        title: title,
        message: text
    });

    // 엔티티 ID 규격인 notify.mobile_app_<디바이스ID>의 서비스단 경로 확정
    const path = `/api/services/notify/mobile_app_${deviceId.replace('mobile_app_', '')}`;
    
    const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Length': Buffer.byteLength(payload)
        },
        agent: isHttps ? haHttpsAgent : haHttpAgent,
        timeout: 5000 // 5초 강제 타임아웃
    };

    const client = isHttps ? https : http;

    return new Promise((resolve) => {
        let timer = setTimeout(() => {
            console.error('[Home Assistant Error] 전송 시간 초과 (5초). 연결 해제.');
            req.destroy();
            resolve();
        }, 5000);

        const req = client.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                clearTimeout(timer);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('[Home Assistant] 모바일 앱 푸시 알림 발송 완료');
                } else {
                    console.error(`[Home Assistant Error] HTTP 상태코드: ${res.statusCode}`);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            clearTimeout(timer);
            console.error('[Home Assistant Error] 통신 예외:', err.message);
            resolve();
        });

        req.write(payload);
        req.end();
    });
}

// 3. 다중 채널 분기 배포 라우터
async function routeNotification({ minutes, seconds, totalMails, docId }) {
    console.log('[진행 내용] 알림 발송 라우터를 구동합니다.');
    const channel = (process.env.NOTIFY_CHANNEL || 'TELEGRAM').toUpperCase();
    
    const provider = process.env.AI_PROVIDER || 'OLLAMA';
    const model = provider === 'OLLAMA' ? (process.env.OLLAMA_MODEL || 'qwen2.5:3b') 
                : provider === 'GEMINI' ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash') 
                : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

    // 텔레그램용 마크다운 메시지
    const docsUrl = docId ? `https://docs.google.com/document/d/${docId}/edit` : '';
    const telegramText = `✅ *[메일 요약 완료]*\n\n` +
        `• 처리 건수: ${totalMails}건\n` +
        `• 소요 시간: ${minutes}분 ${seconds}초\n` +
        `• 사용 AI 공급자: \`${provider}\` (모델: \`${model}\`)\n\n` +
        (docsUrl ? `📎 [구글 독스 바로가기](${docsUrl})` : `⚠️ _구글 독스 ID 없음_`);

    // HA용 일반 텍스트 메시지
    const haText = `처리 건수: ${totalMails}건 / 소요 시간: ${minutes}분 ${seconds}초 / AI: ${provider}(${model})` + 
                   (docsUrl ? `\n문서 주소: ${docsUrl}` : '');

    const promises = [];

    if (channel === 'TELEGRAM' || channel === 'BOTH') {
        promises.push(sendTelegram(telegramText));
    }
    if (channel === 'HA_NOTIFY' || channel === 'BOTH') {
        promises.push(sendHomeAssistant('📧 Mail-Automator 요약 결과', haText));
    }

    await Promise.all(promises);
    console.log('[진행 내용] 모든 지정 채널의 알림 발송을 마쳤습니다.');
}

module.exports = { routeNotification };
