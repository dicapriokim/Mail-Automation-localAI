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
    
    const provider = (process.env.AI_PROVIDER || 'OLLAMA').trim().toUpperCase();
    
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

    // 4. HTML, URL 링크 및 공백 정규화 (스마트 절삭 전처리)
    const cleanedText = processed
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, ' ') // HTML 태그 제거
        .replace(/https?:\/\/[^\s]+/gi, '') // URL 완전 삭제
        .replace(/\[\s*\]/g, '') // 빈 괄호 청소
        .replace(/[ \t]+/g, ' ') // 연속 공백 압축
        .replace(/\n\s*\n/g, '\n\n') // 빈 줄 압축
        .trim();

    // v3.2: 스마트 절삭 (Head & Tail 샌드위치 아키텍처)
    const isLocal = provider === 'OLLAMA';
    // 로컬 AI는 컨텍스트가 좁으므로 Head(400) + Tail(200), 유료는 Head(2500) + Tail(1500)
    const headLength = isLocal ? 400 : 2500;
    const tailLength = isLocal ? 200 : 1500;
    const thresholdLimit = headLength + tailLength;

    const totalLength = cleanedText.length;

    if (totalLength <= thresholdLimit) {
        return cleanedText;
    }

    const headPart = cleanedText.slice(0, headLength);
    const tailPart = cleanedText.slice(-tailLength);

    const truncatedResult = `${headPart}\n\n...[중략: 토큰 최적화를 위해 중간 본문 텍스트가 생략되었습니다]...\n\n${tailPart}`;
    return truncatedResult;
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
async function summarizeBatchWithLLM(texts, forceProvider = null) {
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
        // v3.0: forceProvider 전달
        const chunkSummaries = await summarizeChunkWithLLM(chunk, forceProvider);
        results.push(...chunkSummaries);

        // 로컬 Ollama의 경우 소켓 부하 경감을 위해 필요 시 지연 (클라우드인 경우 단 1회 전송으로 루프가 조기 종료됨)
        if (isLocal && i + CHUNK_SIZE < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    return results;
}

/**
 * 실질적인 LLM API 통신부 (단일 청크)
 * @param {Array<string>} texts - 요약할 메일 본문 배열
 * @param {string|null} forceProvider - 강제할 AI 공급자 (Fallback 시 OLLAMA 강제용)
 * @returns {Promise<Array<Object>>} 요약 결과 배열
 */
async function summarizeChunkWithLLM(texts, forceProvider = null) {
    if (!texts || texts.length === 0) return [];

    try {
        const cleanTexts = texts.map(t => preprocessText(t));
        
        // v3.0 버그 픽스: Fallback 모드 시 환경변수를 무시하고 지정된 공급자(OLLAMA)로 강제 맵핑
        const providerName = forceProvider || (process.env.AI_PROVIDER || 'OLLAMA').trim().toUpperCase();
        const providerInstance = forceProvider ? await AIFactory.createProvider(forceProvider) : AIFactory.getProvider();

        let systemPrompt = "";
        
        if (providerName === 'OLLAMA') {
            systemPrompt = `당신은 전문 이메일 분석가이다. 다음 규칙을 '절대적'으로 엄수하라.
        
        [반드시 지켜야 할 분류 지침]
        1. 무조건 '한국어(Korean)'로 번역하여 요약하라.
        2. 메일 본문이 너무 짧거나 알 수 없는 코드여도 절대 생략하지 말고, 파악할 수 있는 가장 근접한 내용으로 요약하라.
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
        } else {
            systemPrompt = `당신은 최상급 AI 메일 분석 비서이다. 다음 규칙을 '절대적'으로 엄수하라.
        
        [지능형 분류 및 딥 애널리틱스 지침]
        1. 무조건 '한국어(Korean)'로 3문장 심층 요약(배경, 핵심, 결론)을 작성하라.
        2. 본문의 실질적 가치를 심사하여, 사용자가 굳이 읽을 필요가 없는 낚시성 마케팅, 약관 변경 통보, 단순 가입 인사 등은 \`should_trash: true\`로 판별하고 \`trash_reason\`을 적어라.
        (중요 예외 지침): 단, 본문 텍스트 맨 앞에 "[첨부파일: ~ 포함]" 이라는 문구가 있다면, 본문 내용이 거의 없더라도 이는 명세서, 증권사 알림, 보험사 보안 메일 등 중요 첨부파일이 있는 메일이다. 이 경우 절대 \`should_trash: true\`로 판별하지 말고, 반드시 \`action: "필요"\`로 설정한 뒤 요약문에 "첨부된 OOO 파일을 열어서 확인하세요."라고 디테일하게 지시하라.
        3. 결제, 예약, 주문, 일정 메일일 경우 \`extracted_data\` 객체에 핵심 정보(금액, 날짜, 주최측, 주문번호 등)를 추출하라. 추출할 것이 없으면 null로 반환하라.

        [출력 JSON 스키마]
        [
          {
            "category": "결제/영수증 | 보안/인증 | 일정/예약 | 주문/배송 | 중요공지 | 스팸/단순알림 | 일반",
            "summary": "3문장 심층 요약",
            "action": "필요 | 참고 | 불필요",
            "priority": "긴급 | 보통 | 낮음",
            "isAd": true/false,
            "should_trash": true/false,
            "trash_reason": "휴지통 이동 사유 (해당할 경우)",
            "extracted_data": {
              "amount": "금액 (있을 시)",
              "event_date": "일정/날짜 (있을 시)",
              "merchant": "결제처/주최측 (있을 시)",
              "order_number": "주문/예약/송장번호 (있을 시)"
            }
          }
        ]
        
        반드시 마크다운 코드 블록 없이 순수한 JSON 배열만 반환하라.`;
        }

        const userPrompt = `다음은 ${texts.length}개의 이메일 본문 배열이다. 위 지침에 따라 동일한 순서의 JSON 객체 배열로 반환하라.
        
        본문 데이터:
        ${JSON.stringify(cleanTexts)}`;

        // v3.1: 재시도 횟수 상향 및 지능형 딜레이 설정
        const MAX_RETRIES = 2;
        let delayMs = 15000;

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
                // v3.1: 429 에러도 일시적(Transient)으로 취급하여 지능형 백오프 처리
                const isTimeout = apiErr.name === 'AbortError';
                const isTransient = isTimeout ||
                    apiErr.message.includes('ECONNREFUSED') ||
                    apiErr.message.includes('ECONNRESET') ||
                    apiErr.message.includes('503') ||
                    apiErr.message.includes('429') ||
                    apiErr.message.includes('JSON 배열 파싱 실패') ||
                    apiErr instanceof SyntaxError;

                console.log(`[AI Batch Attempt ${attempt + 1}] Error: ${apiErr.message}`);

                if (isTransient && attempt < MAX_RETRIES) {
                    // 서버가 요구하는 Retry-After 시간 지능형 파싱
                    const timeMatch = apiErr.message.match(/retry in ([\d\.]+)s/i);
                    let waitTimeMs = delayMs;
                    
                    if (timeMatch) {
                        const requiredSeconds = parseFloat(timeMatch[1]);
                        // 요구 시간 + 12초(안전 마진)
                        waitTimeMs = (Math.ceil(requiredSeconds) + 12) * 1000;
                        console.log(`[Rate Limit] 구글 서버의 요청에 따라 안전선 포함 ${waitTimeMs / 1000}초 대기 후 재시도합니다...`);
                    } else {
                        // 추출 실패 시 지수 백오프 + Jitter(2~6초)
                        const jitter = Math.floor(Math.random() * 4000) + 2000;
                        waitTimeMs = delayMs + jitter;
                        delayMs = delayMs * 2;
                        console.log(`[Transient Error] 지수 백오프 및 Jitter 적용: ${waitTimeMs / 1000}초 대기 후 재시도합니다...`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, waitTimeMs));
                    continue;
                }
                throw apiErr;
            }
        }
    } catch (err) {
        console.error(`[AI Batch Final Error] ${err.message}`);
        // v3.0: 유료 AI 실패 시 상위 함수로 에러를 던져 완벽한 재귀적 로컬 폴백 모드를 유도합니다.
        throw err;
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
 * @param {Array} rawData - { id/uid, date, from, subject, body } 배열
 * @param {string} channelName - 로그용 채널명 ('Gmail' 또는 'Naver')
 * @param {Object} options - API 제어용 옵션 객체 (예: { auth })
 * @param {boolean} isFallback - 유료 AI 실패로 인한 로컬 재귀 호출 여부
 * @returns {Promise<Array>} 최종 요약 결과 배열
 */
async function applyHybridLLMSummaries(rawData, channelName, options = {}, isFallback = false) {
    const finalResults = [];
    const llmTargets = [];
    const llmIndices = [];

    // v3.0 [완벽한 멀티티어]: isFallback이 참이면 무조건 OLLAMA로 강제하여 로컬 알고리즘 가동
    const providerName = isFallback ? 'OLLAMA' : (process.env.AI_PROVIDER || 'OLLAMA').trim().toUpperCase();
    
    if (isFallback) {
        console.log(`[Fallback] 완벽한 로컬 AI 모드로 알고리즘을 재가동합니다...`);
    }

    rawData.forEach((item, index) => {
        // [v3.0 고도화] OLLAMA일 경우에만 정적 필터링(Bypass)을 적용. Fallback 모드 시 즉각 가동됨.
        if (providerName === 'OLLAMA' && isStaticBypass(item.subject)) {
            if (isFallback) console.log(`[Fallback Bypass] 정적 필터링 적용 (AI 연산 생략): ${item.subject.substring(0, 20)}...`);
            else console.log(`[Bypass] 정적 필터링 적용: ${item.subject.substring(0, 20)}...`);
            
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
            // v3.3: 첨부파일 정보가 있을 경우 본문 맨 앞에 텍스트로 강제 주입(Injection)
            const finalBody = item.attachmentInfo ? `${item.attachmentInfo}\n\n${item.body}` : item.body;
            llmTargets.push(finalBody);
            llmIndices.push(index);
        }
    });

    if (llmTargets.length > 0) {
        console.log(`[${channelName}] LLM 요약 대상: ${llmTargets.length}건`);
        // v3.2: 429 방지를 위해 청크 15건->10건 원복 (본문 4000자로 대폭 확대된 것에 대한 안전 마진)
        const CHUNK_SIZE = 10;
        let summaries = [];
        let chunkFailed = false;

        try {
            for (let i = 0; i < llmTargets.length; i += CHUNK_SIZE) {
                const chunk = llmTargets.slice(i, i + CHUNK_SIZE);
                console.log(`[AI Batch] Chunk 처리 중... (${i + 1} ~ ${Math.min(i + CHUNK_SIZE, llmTargets.length)} / ${llmTargets.length})`);
                
                // v3.0 버그 픽스: 재귀 로컬 폴백 모드(isFallback=true)일 때는 summarizeBatchWithLLM 내부에서도 OLLAMA를 강제로 쓰도록 지시
                const chunkSummaries = await summarizeBatchWithLLM(chunk, isFallback ? 'OLLAMA' : null);
                
                summaries = summaries.concat(chunkSummaries);
                if (i + CHUNK_SIZE < llmTargets.length) {
                    // API 속도 제한 쿨다운을 위한 충분한 여유(Margin)
                    await new Promise(resolve => setTimeout(resolve, 8000)); 
                }
            }
        } catch (err) {
            console.error(`[AI Batch Error] Chunk 처리 중 심각한 에러 발생: ${err.message}`);
            chunkFailed = true;
        }

        if (chunkFailed) {
            if (!isFallback && providerName !== 'OLLAMA') {
                console.log(`[Fallback Trigger] 유료 AI 실패 감지! 로컬 AI 모드로 전면 전환하여 알고리즘을 재실행합니다...`);
                return await applyHybridLLMSummaries(rawData, channelName, options, true);
            } else {
                console.log(`[Safe Fallback] 로컬 AI마저도 실패했습니다. 최후의 텍스트 자르기 방어망을 가동합니다.`);
                summaries = llmTargets.map(() => null);
            }
        }

        llmIndices.forEach((originalIndex, i) => {
            const item = rawData[originalIndex];
            const result = summaries[i] || {
                summary: "[AI 요약 지연] " + preprocessText(item.body).substring(0, 200) + "...",
                action: "참고",
                priority: "보통",
                isAd: false
            };

            finalResults[originalIndex] = {
                id: item.id,
                uid: item.uid,
                date: new Date(item.date).toLocaleDateString('ko-KR'),
                sender: item.from.split('<')[0].replace(/"/g, '').trim(),
                subject: item.subject,
                category: result.category || '일반',
                summary: (result.summary || '').replace(/\r?\n|\r/g, ' ').trim(),
                action: result.action,
                priority: result.priority,
                isAd: result.isAd,
                should_trash: result.should_trash,
                trash_reason: result.trash_reason,
                extracted_data: result.extracted_data
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
    const recentMessages = (resRecent.data.messages || []).slice(0, 30);

    const resOlder = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread -newer_than:1d category:updates -subject:(광고)'
    });
    const olderMessages = (resOlder.data.messages || []).slice(0, 30);

    const targetMessages = [...recentMessages, ...olderMessages].slice(0, 30);
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

        // v3.3: 첨부파일 유무 및 파일명 추출
        let attachmentInfo = '';
        const attachments = parsed.attachments || [];
        if (attachments.length > 0) {
            const fileNames = attachments.map(a => a.filename).filter(Boolean);
            if (fileNames.length > 0) {
                attachmentInfo = `[첨부파일: ${fileNames.join(', ')} 포함]`;
            } else {
                attachmentInfo = `[첨부파일 ${attachments.length}개 포함]`;
            }
        }

        rawData.push({ id: m.id, date, from, subject, body, attachmentInfo });
    }

    return rawData;
}

/**
 * [Task 3] 지메일 요약 데이터 추출 (하이브리드 배치 개편)
 * 하위 호환 유지: 기존 호출부에서 fetchGmailSummaries(auth)로 호출 가능
 */
async function fetchGmailSummaries(auth) {
    const rawData = await fetchGmailRawData(auth);
    const results = await applyHybridLLMSummaries(rawData, 'Gmail', { auth });
    
    // [v3.0] AI 지능형 클린업(Trash) 실행
    const trashTargets = results.filter(r => r.should_trash && r.id);
    if (trashTargets.length > 0) {
        const gmail = google.gmail({ version: 'v1', auth });
        for (const t of trashTargets) {
            try {
                await gmail.users.messages.trash({ userId: 'me', id: t.id });
                console.log(`[AI 지능형 클린업] Gmail 삭제 완료: ${t.subject} (사유: ${t.trash_reason})`);
            } catch (e) { console.error(`[Gmail AI 삭제 에러] ${e.message}`); }
        }
    }
    
    return results;
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

        const sortedRecent = sortByDate(allRecent).slice(0, 30);
        const sortedOlder = sortByDate(allOlderUnseen).slice(0, 30);
        const targetMessages = [...sortedRecent, ...sortedOlder].slice(0, 30);

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

            // v3.3: 첨부파일 유무 및 파일명 추출
            let attachmentInfo = '';
            const attachments = parsed.attachments || [];
            if (attachments.length > 0) {
                const fileNames = attachments.map(a => a.filename).filter(Boolean);
                if (fileNames.length > 0) {
                    attachmentInfo = `[첨부파일: ${fileNames.join(', ')} 포함]`;
                } else {
                    attachmentInfo = `[첨부파일 ${attachments.length}개 포함]`;
                }
            }

            rawData.push({ uid: item.attributes.uid, subject, from, date, body: cleanText, attachmentInfo });
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
    const results = await applyHybridLLMSummaries(rawData, 'Naver');
    
    // [v3.0] AI 지능형 클린업(Trash) 실행
    const trashTargets = results.filter(r => r.should_trash && r.uid);
    if (trashTargets.length > 0 && process.env.NAVER_ID && process.env.NAVER_PW) {
        const config = { imap: { user: process.env.NAVER_ID, password: process.env.NAVER_PW, host: 'imap.naver.com', port: 993, tls: true, authTimeout: 3000 } };
        try {
            const connection = await imaps.connect(config);
            await connection.openBox('INBOX');
            for (const t of trashTargets) {
                try {
                    try {
                        await connection.moveMessage(t.uid, 'Trash');
                    } catch (err) {
                        await connection.moveMessage(t.uid, '휴지통');
                    }
                    console.log(`[AI 지능형 클린업] Naver 휴지통 이동 완료: ${t.subject} (사유: ${t.trash_reason})`);
                } catch(innerErr) {
                    await connection.addFlags(t.uid, '\\Deleted');
                    console.log(`[AI 지능형 클린업] Naver 영구 삭제(Fallback) 완료: ${t.subject}`);
                }
            }
            // 휴지통 보존을 위해 expunge()는 생략
            connection.end();
        } catch (e) { console.error(`[Naver AI 삭제 에러] ${e.message}`); }
    }
    
    return results;
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

    // v3.0: 요약 목록 필터링 함수 (휴지통 분리, 긴급 우선정렬, 상위 10건 제한)
    const processSummaries = (summaries) => {
        if (!summaries || summaries.length === 0) return { keeps: [], trashes: [] };
        const trashes = summaries.filter(s => s.should_trash);
        let keeps = summaries.filter(s => !s.should_trash);
        keeps.sort((a, b) => {
            if (a.priority === '긴급' && b.priority !== '긴급') return -1;
            if (a.priority !== '긴급' && b.priority === '긴급') return 1;
            return 0; // 원래 최신순 유지
        });
        return { keeps: keeps.slice(0, 10), trashes: trashes };
    };

    const gmailProcessed = processSummaries(gmailSummaries);
    const naverProcessed = processSummaries(naverSummaries);
    const allTrashes = [...gmailProcessed.trashes, ...naverProcessed.trashes];

    if (gmailProcessed.keeps.length > 0) {
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

        gmailProcessed.keeps.forEach(s => {
            let actionText = s.action;
            if (actionText === '무시/선택') actionText = '불필요';
            const actionLabel = `[${actionText}]`;
            
            let metaString = '';
            if (s.extracted_data && typeof s.extracted_data === 'object') {
                const parts = [];
                if (s.extracted_data.merchant && s.extracted_data.merchant !== 'null') parts.push(`🏢 ${s.extracted_data.merchant}`);
                if (s.extracted_data.order_number && s.extracted_data.order_number !== 'null') parts.push(`🏷️ 주문번호: ${s.extracted_data.order_number}`);
                if (s.extracted_data.amount && s.extracted_data.amount !== 'null') parts.push(`💰 금액: ${s.extracted_data.amount}`);
                if (s.extracted_data.event_date && s.extracted_data.event_date !== 'null') parts.push(`📅 일정: ${s.extracted_data.event_date}`);
                if (parts.length > 0) metaString = `\n    ➔ 📌 데이터 추출: ${parts.join(' / ')}`;
            }
            if (s.should_trash) {
                metaString += `\n    ➔ 🗑️ AI 지능형 클린업 (휴지통 이동 완료)`;
            }

            const item = `\n[${s.date}] ${s.sender} | ${s.subject}\n    ➔ 핵심 요약: ${s.summary}\n    ➔ 후속 조치: ${actionLabel}${metaString}\n`;
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

    if (naverProcessed.keeps.length > 0) {
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

        naverProcessed.keeps.forEach(s => {
            let actionText = s.action;
            if (actionText === '무시/선택') actionText = '불필요';
            const actionLabel = `[${actionText}]`;
            
            let metaString = '';
            if (s.extracted_data && typeof s.extracted_data === 'object') {
                const parts = [];
                if (s.extracted_data.merchant && s.extracted_data.merchant !== 'null') parts.push(`🏢 ${s.extracted_data.merchant}`);
                if (s.extracted_data.order_number && s.extracted_data.order_number !== 'null') parts.push(`🏷️ 주문번호: ${s.extracted_data.order_number}`);
                if (s.extracted_data.amount && s.extracted_data.amount !== 'null') parts.push(`💰 금액: ${s.extracted_data.amount}`);
                if (s.extracted_data.event_date && s.extracted_data.event_date !== 'null') parts.push(`📅 일정: ${s.extracted_data.event_date}`);
                if (parts.length > 0) metaString = `\n    ➔ 📌 데이터 추출: ${parts.join(' / ')}`;
            }
            if (s.should_trash) {
                metaString += `\n    ➔ 🗑️ AI 지능형 클린업 (휴지통 이동 완료)`;
            }

            const item = `\n[${s.date}] ${s.sender} | ${s.subject}\n    ➔ 핵심 요약: ${s.summary}\n    ➔ 후속 조치: ${actionLabel}${metaString}\n`;
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

    if (allTrashes.length > 0) {
        const trashHeader = `\n🗑️ AI 지능형 클린업 완료 목록 (${allTrashes.length}건)\n`;
        requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: trashHeader } });
        requests.push({
            updateTextStyle: {
                range: { startIndex: currentIndex, endIndex: currentIndex + trashHeader.length },
                textStyle: { fontSize: { magnitude: 11, unit: 'PT' }, bold: true },
                fields: 'fontSize,bold'
            }
        });
        currentIndex += trashHeader.length;

        const trashLines = allTrashes.map(t => `- [${t.sender}] ${t.subject}\n`).join('');
        requests.push({ insertText: { endOfSegmentLocation: { segmentId: '' }, text: trashLines } });
        requests.push({
            updateTextStyle: {
                range: { startIndex: currentIndex, endIndex: currentIndex + trashLines.length },
                textStyle: { fontSize: { magnitude: 9, unit: 'PT' }, foregroundColor: { color: { rgbColor: { red: 0.4, green: 0.4, blue: 0.4 } } } },
                fields: 'fontSize,foregroundColor'
            }
        });
        currentIndex += trashLines.length;
    }

    const totalSummarized = gmailProcessed.keeps.length + naverProcessed.keeps.length;
    const stats = `\n📊 금주 정리 통계\n` +
        `Gmail: ${cleanupStats.gmail.count}건 삭제 (예: ${cleanupStats.gmail.details})\n` +
        `Naver: ${cleanupStats.naver.count}건 삭제 (예: ${cleanupStats.naver.details})\n` +
        `작업 결과: 핵심 뉴스레터 및 우선순위 메일 ${totalSummarized}건 정규화 완료 (스팸 ${allTrashes.length}건 클린업)\n`;

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
