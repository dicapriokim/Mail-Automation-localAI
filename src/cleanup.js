const { google } = require('googleapis');
const imaps = require('imap-simple');
const { authorize } = require('./auth');
require('dotenv').config();

/**
 * 지메일 클린업: ad_deletion_rules.md의 쿼리에 따라 메일 삭제
 */
async function cleanupGmail(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    // 1. 규칙 정의 (ad_deletion_rules.md 기준)
    const ruleConfigs = [
        { q: 'newer_than:30d subject:(광고)', label: '범용 한국어 광고' },
        { q: 'newer_than:30d from:AliExpress subject:(광고)', label: 'AliExpress 광고 프로모션' },
        { q: 'newer_than:30d from:Netflix ("잊지 말고 끝까지 시청하세요" OR "이 장면을 기억하시나요" OR "취향 저격 콘텐츠")', label: 'Netflix 시청 독려 알림' },
        { q: 'newer_than:30d category:promotions ("설문조사" OR "의견을 들려주세요" OR "Survey")', label: '마케팅 설문조사' },
        { q: 'newer_than:30d (성인 OR 도박 OR 카지노 OR 대출 OR 토토) -{from:netflix from:disney from:samsung from:booking from:agoda from:trip from:microsoft from:toss from:google from:kakao from:naver}', label: '스팸 및 불법 광고' }
    ];

    let totalDeleted = 0;
    const deletedLabels = [];

    for (const config of ruleConfigs) {
        const res = await gmail.users.messages.list({ userId: 'me', q: config.q });
        const messages = res.data.messages || [];

        if (messages.length > 0) {
            for (const m of messages) {
                await gmail.users.messages.trash({ userId: 'me', id: m.id });
            }
            totalDeleted += messages.length;
            deletedLabels.push(config.label);
        }
    }

    const details = deletedLabels.length > 0 ? deletedLabels.join(', ') : '삭제된 항목 없음';
    console.log(`[Gmail] ${totalDeleted}건의 메일이 정리되었습니다. (${details})`);
    return { count: totalDeleted, details: details };
}

/**
 * 네이버 클린업: IMAP을 통해 백그라운드에서 (광고) 메일 삭제
 */
async function cleanupNaver() {
    if (!process.env.NAVER_ID || !process.env.NAVER_PW) {
        console.log('[Naver] 계정 정보가 설정되지 않아 건너뜜');
        return { count: 0, details: '계정 미설정' };
    }

    const config = {
        imap: {
            user: process.env.NAVER_ID,
            password: process.env.NAVER_PW,
            host: 'imap.naver.com',
            port: 993,
            tls: true,
            authTimeout: 3000
        }
    };

    try {
        const connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        const searchCriteria = ['UNSEEN', ['SUBJECT', '(광고)']];
        const fetchOptions = { bodies: ['HEADER.FIELDS (SUBJECT)'], struct: true };

        const messages = await connection.search(searchCriteria, fetchOptions);
        let deletedCount = 0;

        if (messages.length > 0) {
            for (const item of messages) {
                await connection.addFlags(item.attributes.uid, '\\Deleted');
                deletedCount++;
            }
            await connection.imap.expunge();
        }

        connection.end();
        const details = deletedCount > 0 ? '(광고) 문구 포함 메일 및 수신동의 확인' : '삭제된 항목 없음';
        console.log(`[Naver] ${deletedCount}건의 메일이 정리되었습니다.`);
        return { count: deletedCount, details: details };
    } catch (err) {
        console.error('[Naver Error]', err.message);
        return { count: 0, details: `오류: ${err.message}` };
    }
}

module.exports = {
    cleanupGmail,
    cleanupNaver
};
