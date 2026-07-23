const net = require('net');
const https = require('https');
const { exec } = require('child_process'); // child_process 모듈 추가
require('dotenv').config();

console.log('[진행 내용] aiProvider.js 로딩 완료. 멀티 AI 팩토리 엔진을 구성합니다.');

// ==========================================
// 1. 기존 Ollama IP 스캔 및 탐색 모듈 (기존 소스 무결성 100% 보존)
// ==========================================
let resolvedOllamaUrl = null;

function testTcpConnection(host, port, timeout = 800) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;
        socket.setTimeout(timeout);
        socket.connect(port, host, () => {
            status = true;
            socket.destroy();
        });
        socket.on('timeout', () => { socket.destroy(); });
        socket.on('error', () => { socket.destroy(); });
        socket.on('close', () => { resolve(status); });
    });
}

async function scanSubnetForOllama() {
    const promises = [];
    for (let i = 1; i < 255; i++) {
        const ip = `192.168.0.${i}`;
        promises.push(
            testTcpConnection(ip, 11434, 400).then(isOpen => isOpen ? ip : null)
        );
    }
    const results = await Promise.all(promises);
    return results.find(ip => ip !== null) || null;
}

async function getResolvedOllamaUrl() {
    if (resolvedOllamaUrl) return resolvedOllamaUrl;
    const envIp = process.env.LOCAL_AI_IP;
    if (envIp) {
        let host = envIp;
        let port = 11434;
        if (envIp.includes(':')) {
            const parts = envIp.split(':');
            host = parts[0];
            port = parseInt(parts[1], 10);
        }
        if (await testTcpConnection(host, port, 400)) {
            resolvedOllamaUrl = `http://${host}:${port}/v1/chat/completions`;
            console.log(`[Ollama Discovery] .env 설정 IP 연결 성공: ${resolvedOllamaUrl}`);
            return resolvedOllamaUrl;
        }
    }
    if (await testTcpConnection('superllm.local', 11434, 400)) {
        resolvedOllamaUrl = `http://superllm.local:11434/v1/chat/completions`;
        return resolvedOllamaUrl;
    }
    const discoveredIp = await scanSubnetForOllama();
    if (discoveredIp) {
        resolvedOllamaUrl = `http://${discoveredIp}:11434/v1/chat/completions`;
        return resolvedOllamaUrl;
    }
    return `http://127.0.0.1:11434/v1/chat/completions`;
}

// ==========================================
// 2. AI Provider 개별 클래스 구현
// ==========================================

let sessionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function addTokenUsage(prompt, completion, total) {
    const p = prompt || 0;
    const c = completion || 0;
    const t = total || (p + c);
    sessionUsage.promptTokens += p;
    sessionUsage.completionTokens += c;
    sessionUsage.totalTokens += t;
}

function getTokenUsage() {
    return { ...sessionUsage };
}

function resetTokenUsage() {
    sessionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/**
 * [정책 보호 및 안정성 재시도 가드]
 * 1순위: 정책 위반 및 계정 차단 차단 (401/403/400 즉시 중단, 최대 3회 재시도 제한, Jitter 백오프)
 * 2순위: 429/503 일시적 서버 부하/네트워크 오류 발생 시 지수 대기 후 자동 복구
 */
async function executeWithRetry(apiCallFn, providerName = 'AI') {
    const MAX_RETRIES = 3;
    let baseDelayMs = 3500;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            return await apiCallFn();
        } catch (err) {
            const errMessage = err.message || '';
            
            // 401(인증 실패), 403(권한 없음), 400(형식 오류)는 재시도 불가능하며 계정 차단 위험이 있으므로 즉시 중단
            const isNonRetryable = errMessage.includes('401') || errMessage.includes('403') || errMessage.includes('400') || errMessage.includes('INVALID_ARGUMENT');
            
            // 429(Rate Limit), 503(Overload), 500/502/504(Server Error), ETIMEDOUT, ECONNRESET 등만 재시도 대상
            const isRetryable = errMessage.includes('429') || 
                                errMessage.includes('503') || 
                                errMessage.includes('500') || 
                                errMessage.includes('502') || 
                                errMessage.includes('504') || 
                                errMessage.includes('RESOURCE_EXHAUSTED') ||
                                errMessage.includes('ETIMEDOUT') || 
                                errMessage.includes('ECONNRESET');

            if (isNonRetryable || !isRetryable || attempt > MAX_RETRIES) {
                if (attempt > MAX_RETRIES) {
                    console.error(`[Retry Guard] ${providerName} ${MAX_RETRIES}회 재시도 후 최종 실패: ${errMessage}`);
                } else if (isNonRetryable) {
                    console.error(`[Policy Guard] ${providerName} 복구 불가능한 에러(인증/권한/형식) 감지. 계정 보호를 위해 즉시 중단합니다: ${errMessage}`);
                }
                throw err;
            }

            // Jitter (±500ms) 추가하여 동시 충돌 방지
            const jitter = (Math.random() - 0.5) * 1000;
            const delay = Math.max(1000, Math.round(baseDelayMs * Math.pow(2, attempt - 1) + jitter));

            console.warn(`[Retry Guard] ${providerName} 일시적 통신/부하 오류(429/503) 감지. [시도 ${attempt}/${MAX_RETRIES}] 계정 보호를 위해 ${(delay / 1000).toFixed(1)}초 대기 후 재시도합니다...`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

class OllamaProvider {
    async chatComplete(systemPrompt, userPrompt) {
        return executeWithRetry(async () => {
            const ollamaUrl = await getResolvedOllamaUrl();
            const model = process.env.OLLAMA_MODEL ? process.env.OLLAMA_MODEL.trim() : 'qwen2.5:3b';
            
            const response = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    options: { num_ctx: 1024, num_thread: 4 },
                    temperature: 0.3,
                    stream: false
                })
            });
            if (!response.ok) throw new Error(`Ollama API 오류 status: ${response.status}`);
            const data = await response.json();
            const p = data.usage?.prompt_tokens || data.prompt_eval_count || 0;
            const c = data.usage?.completion_tokens || data.eval_count || 0;
            const t = data.usage?.total_tokens || (p + c);
            addTokenUsage(p, c, t);
            return data.choices?.[0]?.message?.content || '';
        }, 'Ollama');
    }
}

class GeminiProvider {
    async chatComplete(systemPrompt, userPrompt) {
        return executeWithRetry(async () => {
            const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : undefined;
            const model = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-3.6-flash';
            if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다. .env를 확인해 주세요.');
            
            // Node 런타임 프로토타입/글로벌 변조 영역을 탈출하기 위해 시스템 curl 쉘 세션 호출로 격리합니다.
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            const testPayload = JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\n[요청 데이터]\n${userPrompt}` }]
                    }
                ]
            });

            return new Promise((resolve, reject) => {
                const curlCmd = `curl -s -X POST -H "Content-Type: application/json" -d @- "${url}"`;
                
                const child = exec(curlCmd, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`Gemini curl 실행 오류: ${error.message}`));
                        return;
                    }

                    try {
                        const data = JSON.parse(stdout);
                        if (data.error) {
                            reject(new Error(`[Gemini API 오류 ${data.error.code}] ${data.error.status}: ${data.error.message}`));
                            return;
                        }
                        const p = data.usageMetadata?.promptTokenCount || data.usage?.prompt_tokens || 0;
                        const c = data.usageMetadata?.candidatesTokenCount || data.usage?.completion_tokens || 0;
                        const t = data.usageMetadata?.totalTokenCount || data.usage?.total_tokens || (p + c);
                        addTokenUsage(p, c, t);

                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        resolve(text);
                    } catch (parseErr) {
                        reject(new Error(`Gemini curl 응답 JSON 파싱 오류: ${parseErr.message}. 수신 데이터: ${stdout}`));
                    }
                });

                child.stdin.write(testPayload);
                child.stdin.end();
            });
        }, 'Gemini');
    }
}

class ChatGPTProvider {
    async chatComplete(systemPrompt, userPrompt) {
        return executeWithRetry(async () => {
            const apiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : undefined;
            const model = process.env.OPENAI_MODEL ? process.env.OPENAI_MODEL.trim() : 'gpt-4o-mini';
            if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
            
            const url = 'https://api.openai.com/v1/chat/completions';
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3
                })
            });
            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`ChatGPT API 오류 status ${response.status}: ${errBody}`);
            }
            const data = await response.json();
            const p = data.usage?.prompt_tokens || 0;
            const c = data.usage?.completion_tokens || 0;
            const t = data.usage?.total_tokens || (p + c);
            addTokenUsage(p, c, t);
            return data.choices?.[0]?.message?.content || '';
        }, 'ChatGPT');
    }
}

// ==========================================
// 3. AI Provider 팩토리 클래스
// ==========================================
class AIFactory {
    static getProvider() {
        const providerName = (process.env.AI_PROVIDER || 'OLLAMA').trim().toUpperCase();
        console.log(`[진행 내용] 팩토리 엔진 - 현재 지정된 AI 공급자: ${providerName}`);
        
        switch (providerName) {
            case 'OLLAMA':
                return new OllamaProvider();
            case 'GEMINI':
                return new GeminiProvider();
            case 'CHATGPT':
                return new ChatGPTProvider();
            default:
                console.warn(`[알림] 알려지지 않은 AI 공급자: ${providerName}. 로컬 Ollama로 대체합니다.`);
                return new OllamaProvider();
        }
    }

    static getTokenUsage() {
        return getTokenUsage();
    }

    static resetTokenUsage() {
        resetTokenUsage();
    }
}

module.exports = { AIFactory };
