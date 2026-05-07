const { google } = require('googleapis');
const { authorize } = require('./auth');
const { findDocId } = require('./findDoc');
const { cleanupGmail, cleanupNaver } = require('./cleanup');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
require('dotenv').config();

// Ollama API 설정
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://192.168.x.50:11434/api/generate';

/**
 * 본문 정규화 고도화: MIME 디코딩, 멀티파트 브레이킹, HTML 제거
 */
function preprocessText(text) {
    if (!text) return "";

    let processed = text;

    // 1. Quoted-Printable 디코딩 (=ED=95... 형태 복구)
    if (processed.includes('=') && (processed.includes('=ED') || processed.includes('=EC'))) {
        try {
            processed = processed
                .replace(/=\r?\n/g, '') // Soft line break 제거
                .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
            processed = Buffer.from(processed, 'binary').toString('utf8');
        } catch (e) { }
    }

    // 2. Base64 블록 감지 및 디코딩 연쇄 처리
    if (processed.includes('base64') || /^[A-Za-z0-9+/=]{100,}$/m.test(processed)) {
        const base64Regex = /([A-Za-z0-9+/=]{40,})/g;
        processed = processed.replace(base64Regex, (match) => {
            try {
                const decoded = Buffer.from(match, 'base64').toString('utf8');
                return /[가-힣]/.test(decoded) ? decoded : match;
            } catch (e) { return match; }
        });
    }

    // 3. MIME 멀티파트 구조 강제 분해 및 핵심 텍스트 추출
    if (processed.includes('Content-Type:')) {
        const parts = processed.split(/Content-Type:.*?\n/gi);
        processed = parts.sort((a, b) => b.length - a.length)[0] || processed;
    }

    // 5. HTML 및 공백 정규화
    return processed
        .replace(/<[^>]*>/g, ' ')
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 800);
}

/**
 * [Task 1] Shift-Left 필터링: LLM 호출 전 광고성 메일 차단
 */
function isStaticBypass(subject) {
    const bypassKeywords = ["[광고]", "(광고)", "Newsletter", "뉴스레터", "알림", "Survey", "수신동의", "세미나", "초대"];
    return bypassKeywords.some(keyword => subject.includes(keyword));
}

/**
 * 로컬 Ollama API 통신 전용 함수 (Timeout 및 AbortController 포함)
 */
async function callLocalAI(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120초 타임아웃

    try {
        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "qwen2.5:1.5b",
                prompt: prompt,
                format: "json",
                stream: false,
                options: {
                    temperature: 0
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return JSON.parse(data.response);
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error("Ollama 추론 타임아웃 (120초 초과)");
        }
        throw error;
    }
}

/**
 * [Task 2] 순차 요약 엔진 (Sequential Processing)
 */
async function summarizeBatchWithLLM(texts) {
    if (!texts || texts.length === 0) return [];

    const results = [];
    const cleanTexts = texts.map(t => preprocessText(t));

    console.log(`[Local AI] 총 ${texts.length}건의 메일 순차 요약 시작...`);

    for (let i = 0; i < cleanTexts.length; i++) {
        const text = cleanTexts[i];
        try {
            const prompt = `다음 이메일 본문을 분석하여 핵심 내용을 1문장으로 요약하고 분류 지침에 따라 JSON 객체로 반환하라.
            
            [분류 지침]
            1. '보안 경고', '비정상 로그인', '결제 알림', '2차 인증' 등은 priority: '긴급', action: '필요'로 분류.
            2. '광고', '이벤트', '뉴스레터' 등은 priority: '낮음', action: '불필요', isAd: true 설정.
            3. 일반 공지나 보고서는 priority: '보통', action: '참고', isAd: false 설정.

            [출력 JSON 형식]
            {
              "summary": "1줄 요약 내용",
              "action": "필요 | 참고 | 불필요",
              "priority": "긴급 | 보통 | 낮음",
              "isAd": true/false
            }

            이메일 본문:
            ${text}`;

            const summary = await callLocalAI(prompt);
            results.push(summary);
            console.log(`[Local AI] ${i + 1}/${cleanTexts.length} 요약 완료`);

        } catch (err) {
            console.error(`[Local AI Error] ${i + 1}번째 메일 요약 실패: ${err.message}`);
            // Safe Fallback: 개별 실패 시 무결성 방어
            results.push({
                summary: "[AI 요약 지연] 분석 실패 또는 타임아웃",
                action: "참고",
                priority: "보통",
                isAd: false
            });
        }

        // AI 서버 과부하 방지를 위한 1초 휴지기
        if (i < cleanTexts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

/**
 * 비동기 작업을 순차적으로 실행
 */
async function processInChunks(items, executor) {
    const results = [];
    for (const item of items) {
        const result = await executor(item);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 4500));
    }
    return results;
}

/**
 * 메일 데이터 표준 전처리 (MIME 디코딩 포함)
 */
async function processMailBody(body) {
    if (!body) return "";
    try {
        const parsed = await simpleParser(body);
        const text = parsed.text || parsed.textAsHtml?.replace(/<[^>]*>/g, ' ') || body;
        return preprocessText(text);
    } catch (e) {
        return preprocessText(body);
    }
}

/**
 * [Task 3] 지메일 요약 데이터 추출 (하이브리드 배치 개편)
 */
async function fetchGmailSummaries(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    // 메일 수집 로직 (기존 유지)
    const resRecent = await gmail.users.messages.list({
        userId: 'me',
        q: 'newer_than:1d category:updates -subject:(광고)'
    });
    const recentMessages = (resRecent.data.messages || []).slice(0, 10);

    const resOlder = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread -newer_than:1d category:updates -subject:(광고)'
    });
    const olderMessages = (resOlder.data.messages || []).slice(0, 10);

    const targetMessages = [...recentMessages, ...olderMessages].slice(0, 10);
    console.log(`[Gmail] 최적화 수집 완료: 총 ${targetMessages.length}건 처리 예정`);

    const rawData = [];
    for (const m of targetMessages) {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'raw' });
        const raw = Buffer.from(msg.data.raw, 'base64').toString();

        const parsed = await simpleParser(raw);
        const subject = parsed.subject || 'No Subject';
        const from = parsed.from?.text || 'Unknown';
        const date = parsed.date || new Date();
        const body = parsed.text || parsed.textAsHtml?.replace(/<[^>]*>/g, ' ') || '';

        rawData.push({ id: m.id, date, from, subject, body });
    }

    const finalResults = [];
    const llmTargets = [];
    const llmIndices = [];

    rawData.forEach((item, index) => {
        if (isStaticBypass(item.subject)) {
            console.log(`[Bypass] 정적 필터링 적용: ${item.subject.substring(0, 20)}...`);
            finalResults[index] = {
                date: new Date(item.date).toLocaleDateString('ko-KR'),
                sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                subject: item.subject,
                summary: "단순 알림 또는 수신 동의 확인 메일입니다.",
                action: "불필요",
                priority: "낮음",
                isAd: true
            };
        } else {
            llmTargets.push(item.body);
            llmIndices.push(index);
        }
    });

    if (llmTargets.length > 0) {
        const summaries = await summarizeBatchWithLLM(llmTargets);
        llmIndices.forEach((originalIndex, i) => {
            const item = rawData[originalIndex];
            const result = summaries[i] || {
                summary: "[AI 요약 지연] 분석 실패",
                action: "참고",
                priority: "보통",
                isAd: false
            };

            finalResults[originalIndex] = {
                date: new Date(item.date).toLocaleDateString('ko-KR'),
                sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                subject: item.subject,
                summary: result.summary,
                action: result.action,
                priority: result.priority,
                isAd: result.isAd
            };
        });
    }

    return finalResults.filter(r => r !== undefined);
}

/**
 * [Task 3] 네이버 메일 요약 데이터 추출 (하이브리드 배치 개편)
 */
async function fetchNaverSummaries() {
    if (!process.env.NAVER_ID || !process.env.NAVER_PW) return [];

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

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const fetchOptions = {
            bodies: [''],
            struct: true
        };

        const [allRecent, allOlderUnseen] = await Promise.all([
            connection.search([['SINCE', today]], fetchOptions),
            connection.search(['UNSEEN', ['BEFORE', today]], fetchOptions)
        ]);

        const sortByDate = (msgs) => {
            return msgs.sort((a, b) => b.attributes.uid - a.attributes.uid);
        };

        const sortedRecent = sortByDate(allRecent).slice(0, 10);
        const sortedOlder = sortByDate(allOlderUnseen).slice(0, 10);
        const targetMessages = [...sortedRecent, ...sortedOlder].slice(0, 10);

        console.log(`[Naver] 최적화 수집 완료: 총 ${targetMessages.length}건 처리 예정`);

        const rawData = [];
        for (const item of targetMessages) {
            const rawPart = item.parts.find(p => p.which === '');
            if (!rawPart) continue;

            const parsed = await simpleParser(rawPart.body);
            const cleanText = parsed.text || parsed.textAsHtml?.replace(/<[^>]*>/g, ' ') || '';
            const subject = parsed.subject || 'No Subject';
            const from = parsed.from?.text || 'Unknown';
            const date = parsed.date || new Date();

            rawData.push({ subject, from, date, body: cleanText });
        }

        const finalResults = [];
        const llmTargets = [];
        const llmIndices = [];

        rawData.forEach((item, index) => {
            if (isStaticBypass(item.subject)) {
                console.log(`[Bypass] 정적 필터링 적용: ${item.subject.substring(0, 20)}...`);
                finalResults[index] = {
                    date: new Date(item.date).toLocaleDateString('ko-KR'),
                    sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                    subject: item.subject,
                    summary: "단순 알림 또는 수신 동의 확인 메일입니다.",
                    action: "불필요",
                    priority: "낮음",
                    isAd: true
                };
            } else {
                llmTargets.push(item.body);
                llmIndices.push(index);
            }
        });

        if (llmTargets.length > 0) {
            const summaries = await summarizeBatchWithLLM(llmTargets);
            llmIndices.forEach((originalIndex, i) => {
                const item = rawData[originalIndex];
                const result = summaries[i] || {
                    summary: "[AI 요약 지연] 분석 실패",
                    action: "참고",
                    priority: "보통",
                    isAd: false
                };

                finalResults[originalIndex] = {
                    date: new Date(item.date).toLocaleDateString('ko-KR'),
                    sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                    subject: item.subject,
                    summary: result.summary,
                    action: result.action,
                    priority: result.priority,
                    isAd: result.isAd
                };
            });
        }

        connection.end();
        return finalResults.filter(r => r !== undefined);
    } catch (err) {
        console.error('[Naver Fetch Error]', err.message);
        return [];
    }
}

/**
 * 구글 독스에 V5 리스트 서식 및 고급 스타일 적용하여 기록
 */
async function appendToDocs(auth, documentId, gmailSummaries, naverSummaries, cleanupStats) {
    const docs = google.docs({ version: 'v1', auth });

    const doc = await docs.documents.get({ documentId });
    const content = doc.data.body.content;
    let currentIndex = content[content.length - 1].endIndex - 1;

    const requests = [];
    const now = new Date();
    const weekNumber = Math.ceil(now.getDate() / 7);

    const title = `## [${now.getFullYear()}년 ${now.getMonth() + 1}월 ${weekNumber}주차] 요약 보고서\n`;
    requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: title } });

    requests.push({
        updateTextStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + title.length },
            textStyle: { fontSize: { magnitude: 18, unit: 'PT' }, bold: true },
            fields: 'fontSize,bold'
        }
    });
    currentIndex += title.length;

    if (gmailSummaries.length > 0) {
        const gmailHeader = `### 📧 Gmail\n`;
        requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: gmailHeader } });
        requests.push({
            updateTextStyle: {
                range: { startIndex: currentIndex, endIndex: currentIndex + gmailHeader.length },
                textStyle: { fontSize: { magnitude: 12, unit: 'PT' }, bold: true },
                fields: 'fontSize,bold'
            }
        });
        currentIndex += gmailHeader.length;

        gmailSummaries.forEach(s => {
            const actionLabel = `[${s.action}]`;
            const item = `\n[${s.date}] ${s.sender} | ${s.subject}\n    ➔ 핵심 요약: ${s.summary}\n    ➔ 후속 조치: ${actionLabel}\n`;
            requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: item } });

            const firstLineEnd = item.indexOf('\n', 1);
            const titleRange = { startIndex: currentIndex, endIndex: currentIndex + (firstLineEnd > 0 ? firstLineEnd : item.length) };

            requests.push({
                updateTextStyle: {
                    range: { startIndex: currentIndex, endIndex: currentIndex + item.length },
                    textStyle: { fontSize: { magnitude: 10, unit: 'PT' } },
                    fields: 'fontSize'
                }
            });

            if (s.priority === '긴급') {
                requests.push({
                    updateTextStyle: {
                        range: titleRange,
                        textStyle: {
                            fontSize: { magnitude: 11, unit: 'PT' },
                            foregroundColor: { color: { rgbColor: { red: 1.0, green: 0.0, blue: 0.0 } } },
                            bold: true
                        },
                        fields: 'fontSize,foregroundColor,bold'
                    }
                });
            } else {
                requests.push({
                    updateTextStyle: {
                        range: titleRange,
                        textStyle: {
                            fontSize: { magnitude: 11, unit: 'PT' },
                            bold: true
                        },
                        fields: 'fontSize,bold'
                    }
                });
            }

            currentIndex += item.length;
        });
    }

    if ((naverSummaries || []).length > 0) {
        const naverHeader = `### 📗 Naver Mail\n`;
        requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: naverHeader } });
        requests.push({
            updateTextStyle: {
                range: { startIndex: currentIndex, endIndex: currentIndex + naverHeader.length },
                textStyle: { fontSize: { magnitude: 12, unit: 'PT' }, bold: true },
                fields: 'fontSize,bold'
            }
        });
        currentIndex += naverHeader.length;

        naverSummaries.forEach(s => {
            const actionLabel = `[${s.action}]`;
            const item = `\n[${s.date}] ${s.sender} | ${s.subject}\n    ➔ 핵심 요약: ${s.summary}\n    ➔ 후속 조치: ${actionLabel}\n`;
            requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: item } });

            const firstLineEnd = item.indexOf('\n', 1);
            const titleRange = { startIndex: currentIndex, endIndex: currentIndex + (firstLineEnd > 0 ? firstLineEnd : item.length) };

            requests.push({
                updateTextStyle: {
                    range: { startIndex: currentIndex, endIndex: currentIndex + item.length },
                    textStyle: { fontSize: { magnitude: 10, unit: 'PT' } },
                    fields: 'fontSize'
                }
            });

            if (s.priority === '긴급') {
                requests.push({
                    updateTextStyle: {
                        range: titleRange,
                        textStyle: {
                            fontSize: { magnitude: 11, unit: 'PT' },
                            foregroundColor: { color: { rgbColor: { red: 1.0, green: 0.0, blue: 0.0 } } },
                            bold: true
                        },
                        fields: 'fontSize,foregroundColor,bold'
                    }
                });
            } else {
                requests.push({
                    updateTextStyle: {
                        range: titleRange,
                        textStyle: {
                            fontSize: { magnitude: 11, unit: 'PT' },
                            bold: true
                        },
                        fields: 'fontSize,bold'
                    }
                });
            }

            currentIndex += item.length;
        });
    }

    const totalSummarized = gmailSummaries.length + (naverSummaries || []).length;
    const stats = `\n📊 금주 정리 통계\n` +
        `- Gmail: ${cleanupStats.gmail.count}건 삭제 (예: ${cleanupStats.gmail.details})\n` +
        `- Naver: ${cleanupStats.naver.count}건 삭제 (예: ${cleanupStats.naver.details})\n` +
        `- 작업 결과: 핵심 뉴스레터 및 주문/배송 관련 메일 ${totalSummarized}건 정규화 완료\n`;

    requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: stats } });
    requests.push({
        updateTextStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + stats.length },
            textStyle: { fontSize: { magnitude: 11, unit: 'PT' } },
            fields: 'fontSize'
        }
    });

    const statsHeader = "📊 금주 정리 통계";
    const headerStart = currentIndex + stats.indexOf(statsHeader);
    requests.push({
        updateTextStyle: {
            range: { startIndex: headerStart, endIndex: headerStart + statsHeader.length },
            textStyle: { bold: true, fontSize: { magnitude: 12, unit: 'PT' } },
            fields: 'bold,fontSize'
        }
    });

    await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: { requests }
    });

    console.log(`[Docs] 스타일 적용된 보고서 기록 완료`);
}

async function clearDocContents(auth, documentId) {
    const docs = google.docs({ version: 'v1', auth });
    const doc = await docs.documents.get({ documentId });
    const content = doc.data.body.content;
    const endIndex = content[content.length - 1].endIndex - 1;

    if (endIndex > 1) {
        console.log(`[Cleanup] 문서 전체 내용을 초기화합니다...`);
        await docs.documents.batchUpdate({
            documentId,
            requestBody: {
                requests: [
                    {
                        deleteContentRange: {
                            range: { startIndex: 1, endIndex: endIndex }
                        }
                    },
                    {
                        insertText: {
                            location: { index: 1 },
                            text: 'Weekly Newsletter Summary\n'
                        }
                    }
                ]
            }
        });
    }
}

async function cleanupOldReports(auth, documentId) {
    const docs = google.docs({ version: 'v1', auth });
    const doc = await docs.documents.get({ documentId });
    const content = doc.data.body.content;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const deleteRequests = [];
    const sections = [];

    for (let i = 0; i < content.length; i++) {
        const element = content[i];
        if (element.paragraph) {
            const text = element.paragraph.elements.map(e => e.textRun?.content).join('');
            const match = text.match(/\[(\d{4})년 (\d{1,2})월 (\d)주차\]/);
            if (match) {
                const year = parseInt(match[1]);
                const month = parseInt(match[2]);
                const reportDate = new Date(year, month - 1, 1);

                sections.push({
                    startIndex: element.startIndex,
                    date: reportDate
                });
            }
        }
    }

    for (let j = 0; j < sections.length; j++) {
        const section = sections[j];
        if (section.date < sixMonthsAgo) {
            const nextSectionStart = (j + 1 < sections.length) ? sections[j + 1].startIndex : doc.data.body.content[doc.data.body.content.length - 1].endIndex - 1;

            deleteRequests.push({
                deleteContentRange: {
                    range: {
                        startIndex: section.startIndex,
                        endIndex: nextSectionStart
                    }
                }
            });
        }
    }

    if (deleteRequests.length > 0) {
        console.log(`[Cleanup] ${deleteRequests.length}개의 오래된 섹션을 삭제합니다...`);
        await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests: deleteRequests.reverse() }
        });
    }
}

async function main() {
    try {
        const auth = await authorize();
        let docId = process.env.GOOGLE_DOC_ID;

        if (!docId) {
            console.log('[Info] .env에 GOOGLE_DOC_ID가 없어 검색을 시작합니다...');
            docId = await findDocId(auth);
        }

        if (!docId) {
            console.error('[Error] 기록할 구글 독스 문서를 찾을 수 없습니다.');
            return;
        }

        console.log('[Step -1] 문서 초기화 중...');
        await clearDocContents(auth, docId);

        console.log('[Step 0] 자동 정리 로직 실행 중...');
        await cleanupOldReports(auth, docId);

        console.log('[Step 1] 클린업 시작...');
        const [gmailCleanup, naverCleanup] = await Promise.all([
            cleanupGmail(auth),
            cleanupNaver()
        ]);

        console.log('[Step 2] 메일 요약 데이터 추출 중 (Ollama Local AI)...');
        const gmailData = await fetchGmailSummaries(auth);
        const naverData = await fetchNaverSummaries();

        console.log('[Step 3] 구글 독스 기록 중...');
        await appendToDocs(auth, docId, gmailData, naverData, { gmail: gmailCleanup, naver: naverCleanup });

        console.log('[Success] 메일 요약 및 기록 작업이 완료되었습니다.');
    } catch (err) {
        console.error('[Main Error]', err.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    fetchGmailSummaries,
    fetchNaverSummaries,
    appendToDocs,
    clearDocContents,
    cleanupOldReports
};
