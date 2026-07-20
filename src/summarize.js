const { google } = require('googleapis');
const { authorize } = require('./auth');
const { findDocId } = require('./findDoc');
const { cleanupGmail, cleanupNaver } = require('./cleanup');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const net = require('net');
require('dotenv').config();

const { AIFactory } = require('./aiProvider');

// (이전의 Ollama 동적 IP 탐색 및 캐싱 모듈은 /src/aiProvider.js 로 정상 이관되었습니다.)

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

    // 5. HTML 및 공백 정규화 (style, script 완전 제거)
    return processed
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 600); // 처리 속도 극한 최적화를 위해 토큰 허용량 반토막 (1200 -> 600)
}

/**
 * [Task 1] Shift-Left 필터링: LLM 호출 전 광고성/단순알림 메일 차단 (시간 단축 핵심)
 */
function isStaticBypass(subject) {
    const bypassKeywords = ["[광고]", "(광고)", "Newsletter", "뉴스레터", "알림", "Survey", "수신동의", "세미나", "초대", "주문", "결제", "배송", "출고", "승인", "영수증", "환영"];
    return bypassKeywords.some(keyword => subject.includes(keyword));
}

/**
 * [Task 2] 배치 요약 엔진 장착 (10x 멀티플라이어)
 */
async function summarizeBatchWithLLM(texts) {
    if (!texts || texts.length === 0) return [];

    const provider = (process.env.AI_PROVIDER || 'OLLAMA').toUpperCase();
    
    // AI 공급자에 따른 동적 배치 정책 수립
    // 1. OLLAMA(로컬): 1건씩 안전하게 순차 처리
    // 2. GEMINI/CHATGPT(클라우드): 한 번에 묶어서 보내어 429 차단 및 속도 10배 단축
    const isLocal = provider === 'OLLAMA';
    const CHUNK_SIZE = isLocal ? 1 : 20; 
    const DELAY_MS = isLocal ? 0 : 0; // 클라우드는 1회 호출로 끝나므로 딜레이 불필요

    const results = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
        const chunk = texts.slice(i, i + CHUNK_SIZE);
        console.log(`[AI Batch] 공급자: ${provider} | ${texts.length}건 중 ${i + 1}~${Math.min(i + CHUNK_SIZE, texts.length)}번째 메일 요약 처리 중...`);
        const chunkSummaries = await summarizeChunkWithLLM(chunk);
        results.push(...chunkSummaries);

        // 로컬 Ollama의 경우 소켓 부하 경감을 위해 필요 시 지연 (클라우드인 경우 단 1회 전송으로 루프가 조기 종료됨)
        if (isLocal && i + CHUNK_SIZE < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    return results;
}

async function summarizeChunkWithLLM(texts) {
    if (!texts || texts.length === 0) return [];

    try {
        const cleanTexts = texts.map(t => preprocessText(t));
        const providerInstance = AIFactory.getProvider();

        const systemPrompt = `당신은 전문 이메일 분석가이다. 다음 규칙을 '절대적'으로 엄수하라.
        
        [반드시 지켜야 할 분류 지침]
        1. 무조건 '한국어(Korean)'로 번역하여 요약하라. 본문이 중국어, 영어나 다른 언어라도 요약은 반드시 한국어로만 작성해야 한다.
        2. 메일 본문이 너무 짧거나 알 수 없는 코드여도 절대 생략하지 말고, 파악할 수 있는 가장 근접한 내용으로 무조건 요약하라. (빈 배열 반환 금지)
        3. '보안 경고', '비정상 로그인', '결제 알림', '2차 인증' 등은 priority: '긴급', action: '필요'로 분류하라.
        4. '광고', '이벤트', '세미나', '뉴스레터'는 아무리 '마감 임박' 등의 문구가 있어도 priority: '낮음', action: '무시/선택'으로 분류하고 isAd: true를 설정하라.
        5. 단순 공지사항이나 주간 보고 등은 priority: '보통', action: '참고'로 분류하라.

        [출력 JSON 스키마]
        [
          {
            "summary": "한국어 1~2문장 요약 내용",
            "action": "필요 | 참고 | 불필요",
            "priority": "긴급 | 보통 | 낮음",
            "isAd": true/false
          }
        ]
        
        반드시 마크다운 코드 블록 없이 순수한 JSON 배열만 반환하라.`;

        const userPrompt = `다음은 ${texts.length}개의 이메일 본문 배열이다. 위 지침에 따라 동일한 순서의 JSON 객체 배열로 반환하라.
        
        본문 데이터:
        ${JSON.stringify(cleanTexts)}`;

        const MAX_RETRIES = 1;
        let delayMs = 3000;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const responseText = await providerInstance.chatComplete(systemPrompt, userPrompt);

                // JSON 추출 정규화 로직 (코드 블록 제거 및 방어)
                let cleanJsonString = responseText
                    .replace(/\`\`\`json\s*/gi, '')
                    .replace(/\`\`\`\s*/g, '')
                    .trim();
                
                const match = cleanJsonString.match(/[\{\[][\s\S]*[\}\]]/);
                if (match) {
                    cleanJsonString = match[0];
                }

                let summaries = JSON.parse(cleanJsonString);

                // 만약 단일 객체로 반환했다면 배열로 감싸기
                if (!Array.isArray(summaries) && typeof summaries === 'object' && summaries !== null) {
                    summaries = [summaries];
                }

                // 빈 배열이 반환되거나 길이가 안 맞을 경우 에러 발생
                if (Array.isArray(summaries) && summaries.length === texts.length) {
                    console.log(`[AI Batch] ${texts.length}건 중 요약 성공 (API 소모 완료)`);
                    return summaries;
                }
                throw new Error(`JSON 배열 파싱 실패 또는 길이 불일치 (기대: ${texts.length}, 수신: ${summaries ? summaries.length : 0})`);
            } catch (apiErr) {
                const isTimeout = apiErr.name === 'AbortError';
                const isTransient = isTimeout ||
                    apiErr.message.includes('ECONNREFUSED') ||
                    apiErr.message.includes('ECONNRESET') ||
                    apiErr.message.includes('503') ||
                    apiErr.message.includes('JSON 배열 파싱 실패') ||
                    apiErr instanceof SyntaxError;

                console.log(`[AI Batch Attempt ${attempt + 1}] Error: ${apiErr.message}`);

                if (isTransient && attempt < MAX_RETRIES) {
                    console.log(`${delayMs / 1000}초 대기 후 재시도합니다... (Transient Error 대응)`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    delayMs *= 2;
                    continue;
                }
                throw apiErr;
            }
        }
    } catch (err) {
        console.error(`[AI Batch Final Error] ${err.message}`);
        return texts.map(() => null); // 전원 Safe Fallback 유도
    }
}

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
 * [공통] 하이브리드 배치 처리 - 정적 필터링 + LLM 요약
 * 수집된 rawData를 받아 정적 필터링 후 LLM 요약을 적용합니다.
 * @param {Array} rawData - { date, from, subject, body } 배열
 * @param {string} channelName - 로그용 채널명 ('Gmail' 또는 'Naver')
 * @returns {Promise<Array>} 최종 요약 결과 배열
 */
async function applyHybridLLMSummaries(rawData, channelName) {
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
                action: "무시/선택",
                priority: "낮음",
                isAd: true
            };
        } else {
            llmTargets.push(item.body);
            llmIndices.push(index);
        }
    });

    if (llmTargets.length > 0) {
        console.log(`[${channelName}] LLM 요약 대상: ${llmTargets.length}건`);
        const summaries = await summarizeBatchWithLLM(llmTargets);
        llmIndices.forEach((originalIndex, i) => {
            const item = rawData[originalIndex];
            const result = summaries[i] || {
                summary: "[AI 요약 지연] " + preprocessText(item.body).substring(0, 200) + "...",
                action: "참고",
                priority: "보통",
                isAd: false
            };

            finalResults[originalIndex] = {
                date: new Date(item.date).toLocaleDateString('ko-KR'),
                sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                subject: item.subject,
                summary: (result.summary || '').replace(/\r?\n|\r/g, ' ').trim(),
                action: result.action,
                priority: result.priority,
                isAd: result.isAd
            };
        });
    }

    return finalResults.filter(r => r !== undefined);
}

/**
 * [Task 3-1] 지메일 원문 수집 (네트워크 I/O 단계)
 * Gmail API를 통해 메일 원문을 수집하고 MIME 파싱까지만 수행합니다.
 * LLM 요약은 포함하지 않습니다.
 */
async function fetchGmailRawData(auth) {
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

        // 표준 전처리 적용 (MIME 디코딩, HTML 제거 등)
        const parsed = await simpleParser(raw);
        const subject = parsed.subject || 'No Subject';
        const from = parsed.from?.text || 'Unknown';
        const date = parsed.date || new Date();
        const body = parsed.text || parsed.textAsHtml?.replace(/<[^>]*>/g, ' ') || '';

        rawData.push({ id: m.id, date, from, subject, body });
    }

    return rawData;
}

/**
 * [Task 3] 지메일 요약 데이터 추출 (하이브리드 배치 개편)
 * 하위 호환 유지: 기존 호출부에서 fetchGmailSummaries(auth)로 호출 가능
 */
async function fetchGmailSummaries(auth) {
    const rawData = await fetchGmailRawData(auth);
    return applyHybridLLMSummaries(rawData, 'Gmail');
}

/**
 * [Task 3-1] 네이버 메일 원문 수집 (네트워크 I/O 단계)
 * Naver IMAP을 통해 메일 원문을 수집하고 MIME 파싱까지만 수행합니다.
 * LLM 요약은 포함하지 않습니다.
 * @returns {Promise<Array>} rawData 배열, 에러 시 빈 배열
 */
async function fetchNaverRawData() {
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

        // [Task 2] IMAP에서 메일의 전체 소스(Raw Source)를 수집하기 위해 bodies: [''] 설정
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

            // [Task 2] simpleParser를 통한 Base64/MIME 디코딩 수행
            const parsed = await simpleParser(rawPart.body);

            // 텍스트 우선 추출, 없으면 HTML에서 태그 제거
            const cleanText = parsed.text || parsed.textAsHtml?.replace(/<[^>]*>/g, ' ') || '';
            const subject = parsed.subject || 'No Subject';
            const from = parsed.from?.text || 'Unknown';
            const date = parsed.date || new Date();

            rawData.push({ subject, from, date, body: cleanText });
        }

        connection.end();
        return rawData;
    } catch (err) {
        console.error('[Naver Fetch Error]', err.message);
        return [];
    }
}

/**
 * [Task 3] 네이버 메일 요약 데이터 추출 (하이브리드 배치 개편)
 * 하위 호환 유지: 기존 호출부에서 fetchNaverSummaries()로 호출 가능
 */
async function fetchNaverSummaries() {
    const rawData = await fetchNaverRawData();
    return applyHybridLLMSummaries(rawData, 'Naver');
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
            let actionText = s.action;
            if (actionText === '무시/선택') actionText = '불필요';
            const actionLabel = `[${actionText}]`;
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
            let actionText = s.action;
            if (actionText === '무시/선택') actionText = '불필요';
            const actionLabel = `[${actionText}]`;
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
        `Gmail: ${cleanupStats.gmail.count}건 삭제 (예: ${cleanupStats.gmail.details})\n` +
        `Naver: ${cleanupStats.naver.count}건 삭제 (예: ${cleanupStats.naver.details})\n` +
        `작업 결과: 핵심 뉴스레터 및 주문/배송 관련 메일 ${totalSummarized}건 정규화 완료\n`;

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

    console.log(`[Docs] 스타일 적용된 보고서 기록 완료: ${documentId}`);
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

        console.log('[Step 2] 메일 원문 수집 중 (Gmail API + Naver IMAP 병렬)...');
        const [gmailRaw, naverRaw] = await Promise.all([
            fetchGmailRawData(auth),
            fetchNaverRawData()
        ]);

        console.log('[Step 2.5] LLM 요약 중 (Ollama qwen2.5:3b, 순차 처리)...');
        const gmailData = await applyHybridLLMSummaries(gmailRaw, 'Gmail');
        const naverData = await applyHybridLLMSummaries(naverRaw, 'Naver');

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
    fetchGmailRawData,
    fetchNaverRawData,
    applyHybridLLMSummaries,
    appendToDocs,
    clearDocContents,
    cleanupOldReports
};
