const fs = require('fs').promises;
const readline = require('readline');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');

// ANSI 컬러 코드 및 제어 상수
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

console.log('[진행 내용] setup.js 로딩 완료. 전체 연속 설정 마법사가 지원되는 대화형 시스템을 시작합니다.');

function askQuestion(rl, query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

// 터미널 화면을 깨끗하게 지우는 헬퍼 함수
function clearConsole() {
    process.stdout.write('\x1bc');
}

// .env 세션 구분 표준 주석 템플릿
const DEFAULT_ENV_TEMPLATE = `# ==========================================
# 1. Mail Account Settings (메일 수집 계정)
# ==========================================
NAVER_ID=""
NAVER_PW=""

# ==========================================
# 2. Google Docs Report Settings (보고서 기록 설정)
# ==========================================
GOOGLE_DOC_ID=""

# ==========================================
# 3. AI Provider Settings (LLM 엔진 설정)
# ==========================================
# AI_PROVIDER 선택: OLLAMA | GEMINI | CHATGPT
AI_PROVIDER="OLLAMA"

# Ollama 설정 (로컬 AI)
LOCAL_AI_IP=""
OLLAMA_MODEL="qwen2.5:3b"

# Google Gemini 설정
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.6-flash"

# OpenAI ChatGPT 설정
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"

# ==========================================
# 4. Notification Settings (알림 수신 설정)
# ==========================================
# NOTIFY_CHANNEL 선택: TELEGRAM | HA_NOTIFY | BOTH
NOTIFY_CHANNEL="TELEGRAM"

# Telegram 설정
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

# Home Assistant 설정
HA_URL="http://homeassistant.local:8123"
HA_TOKEN=""
HA_MOBILE_ENTITY=""`;

// .env 파싱 함수 (주석 구조 및 값들의 정밀 보존)
async function readEnv(silent = false) {
    if (!silent) console.log('[진행 내용] 기존 .env 파일 분석 시작...');
    const config = {};
    let lines = [];
    try {
        const content = await fs.readFile(ENV_PATH, 'utf8');
        lines = content.split(/\r?\n/);
    } catch (err) {
        if (!silent) console.log('[진행 내용] 기존 .env 파일이 존재하지 않아 표준 세션 주석 양식 템플릿으로 새로운 설정을 구성합니다.');
        lines = DEFAULT_ENV_TEMPLATE.split(/\r?\n/);
    }

    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const parts = trimmed.split('=');
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            config[key] = value;
        }
    }
    return { config, lines };
}

// .env 저장 함수 (사용자 기존 환경변수의 무결성 유지)
async function writeEnv(updatedConfig) {
    const { config, lines } = await readEnv(true);
    
    const finalConfig = { ...config, ...updatedConfig };
    const outputLines = [];
    const keysWritten = new Set();
    
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const key = trimmed.split('=')[0].trim();
            if (finalConfig[key] !== undefined) {
                outputLines.push(`${key}="${finalConfig[key]}"`);
                keysWritten.add(key);
                continue;
            }
        }
        outputLines.push(line);
    }
    
    for (let key in finalConfig) {
        if (!keysWritten.has(key)) {
            outputLines.push(`${key}="${finalConfig[key]}"`);
        }
    }
    
    await fs.writeFile(ENV_PATH, outputLines.join('\n'), 'utf8');
}

// 도움말 출력 서브 메뉴
async function showHelpMenu(rl) {
    while (true) {
        clearConsole();
        console.log('==================================================');
        console.log('   🔑 주요 연동 토큰/비밀번호 발급처 도움말 가이드');
        console.log('==================================================');
        console.log('[1] 네이버 애플리케이션 비밀번호 발급처 및 방법');
        console.log('[2] Google Cloud Credentials 및 구글 독스 문서 ID');
        console.log('[3] Google Gemini API Key 발급처');
        console.log('[4] OpenAI ChatGPT API Key 발급처');
        console.log('[5] Home Assistant Long-Lived Access Token 발급처');
        console.log('[0] 메인 메뉴로 돌아가기 (뒤로 가기)');
        console.log('==================================================');

        const select = await askQuestion(rl, '조회할 항목을 선택하세요: ');

        if (select === '0' || select === '') {
            break;
        }

        clearConsole();
        if (select === '1') {
            console.log('--------------------------------------------------');
            console.log('📌 네이버 IMAP 전용 보안키 (웹로그인 비번X) (NAVER_PW)');
            console.log('--------------------------------------------------');
            console.log('1. 발급처: 네이버 로그인 -> [내정보] -> [보안설정] -> [2단계 인증] 상세 설정');
            console.log('2. 하단 [애플리케이션 비밀번호 관리]에서 기기/서비스 이름 등록 후 생성');
            console.log('3. 화면에 생성되는 영문 대문자 12자리를 .env 또는 setup에 입력합니다.');
            console.log('\n⚠️ [필수] 네이버 메일 웹페이지 -> [환경설정] -> [IMAP/SMTP 설정]에서 \'사용함\'으로 켜두어야 합니다.');
        }
        else if (select === '2') {
            console.log('--------------------------------------------------');
            console.log('📌 Google Cloud Credentials 및 GOOGLE_DOC_ID');
            console.log('--------------------------------------------------');
            console.log('1. credentials.json: [Google Cloud Console] (https://console.cloud.google.com) 접속');
            console.log('2. OAuth 2.0 클라이언트 ID를 데스크톱 앱 형태로 생성한 후 JSON 다운로드하여 프로젝트 루트에 저장');
            console.log('3. GOOGLE_DOC_ID: 요약 보고서를 기록할 빈 구글 문서(Google Docs)를 만들고 URL 주소창의 ID를 복사합니다.');
        }
        else if (select === '3') {
            console.log('--------------------------------------------------');
            console.log('📌 Google Gemini API Key (GEMINI_API_KEY)');
            console.log('--------------------------------------------------');
            console.log('1. 발급처: [Google AI Studio] (https://aistudio.google.com/) 접속');
            console.log('2. [Get API key] 버튼을 누르고 프로젝트를 선택하여 API 키를 신규 발급합니다.');
        }
        else if (select === '4') {
            console.log('--------------------------------------------------');
            console.log('📌 OpenAI ChatGPT API Key (OPENAI_API_KEY)');
            console.log('--------------------------------------------------');
            console.log('1. 발급처: [OpenAI Platform] (https://platform.openai.com/api-keys) 접속');
            console.log('2. [Create new secret key] 버튼을 클릭해 새로운 API Key를 발급받습니다.');
        }
        else if (select === '5') {
            console.log('--------------------------------------------------');
            console.log('📌 Home Assistant Long-Lived Token (HA_TOKEN)');
            console.log('--------------------------------------------------');
            console.log('1. 발급처: Home Assistant 대시보드 로그인');
            console.log('2. 사용자 프로필 아이콘 클릭 -> 가장 아래로 스크롤 이동');
            console.log('3. [장기 사용 토큰]에서 [토큰 만들기] 클릭 후 생성된 문자열을 복사합니다.');
        }
        else {
            console.log('⚠️ 올바른 번호를 선택하세요.');
        }
        await askQuestion(rl, '\n도움말 목록으로 돌아가려면 엔터(Enter) 키를 누르세요...');
    }
}

// 마스킹 처리 헬퍼 함수들
function getMaskedValue(value) {
    if (!value || value.trim() === '') return '(미설정)';
    if (value.length <= 6) return '******';
    return value.substring(0, 3) + '******' + value.substring(value.length - 3);
}

function getMaskedEmail(email) {
    if (!email || email.trim() === '') return '(미설정)';
    const parts = email.split('@');
    if (parts.length !== 2) return getMaskedValue(email);
    const username = parts[0];
    const domain = parts[1];
    
    const maskedUser = username.length > 3 ? username.substring(0, 3) + '***' : '***';
    const domainParts = domain.split('.');
    const domainName = domainParts[0];
    const ext = domainParts.slice(1).join('.');
    
    const maskedDomain = domainName.length > 2 ? domainName.substring(0, 2) + '***' : '***';
    return `${maskedUser}@${maskedDomain}.${ext}`;
}

function getMaskedDocId(docId) {
    if (!docId || docId.trim() === '') return '(미설정)';
    if (docId.length <= 10) return '******';
    return docId.substring(0, 4) + '************************' + docId.substring(docId.length - 4);
}

function getSensitiveStatus(val) {
    if (!val || val.trim() === '') {
        return `${RED}⚠️ 미설정 (CLI 입력 또는 .env 편집 필요)${RESET}`;
    }
    return `${GREEN}🔒 설정 완료 (${getMaskedValue(val)})${RESET}`;
}

// 현재 설정 보기 출력 기능
async function viewCurrentSettings(rl, state) {
    clearConsole();
    console.log('=========================================');
    console.log('       🔍 현재 적용된 환경 설정 상태');
    console.log('=========================================');
    console.log(`[메일] NAVER_ID           : ${getMaskedEmail(state.NAVER_ID)}`);
    console.log(`[메일] NAVER_PW           : ${getSensitiveStatus(state.NAVER_PW)}`);
    console.log(`[문서] GOOGLE_DOC_ID       : ${getMaskedDocId(state.GOOGLE_DOC_ID)}`);
    console.log('-----------------------------------------');
    console.log(`[AI]   AI_PROVIDER        : ${state.AI_PROVIDER}`);
    console.log(`[AI]   Ollama IP          : ${state.LOCAL_AI_IP || '(미지정 - 자동 탐색 모드)'}`);
    console.log(`[AI]   Ollama 모델        : ${state.OLLAMA_MODEL}`);
    console.log(`[AI]   Gemini API Key     : ${getSensitiveStatus(state.GEMINI_API_KEY)}`);
    console.log(`[AI]   Gemini 모델        : ${state.GEMINI_MODEL}`);
    console.log(`[AI]   ChatGPT API Key    : ${getSensitiveStatus(state.OPENAI_API_KEY)}`);
    console.log(`[AI]   ChatGPT 모델       : ${state.OPENAI_MODEL}`);
    console.log('-----------------------------------------');
    console.log(`[알림] NOTIFY_CHANNEL     : ${state.NOTIFY_CHANNEL}`);
    console.log(`[알림] Telegram Token     : ${getSensitiveStatus(state.TELEGRAM_BOT_TOKEN)}`);
    console.log(`[알림] Telegram Chat ID   : ${getSensitiveStatus(state.TELEGRAM_CHAT_ID)}`);
    console.log(`[알림] HA Server URL      : ${state.HA_URL}`);
    console.log(`[알림] HA Token           : ${getSensitiveStatus(state.HA_TOKEN)}`);
    console.log(`[알림] HA 기기 엔티티 ID    : ${state.HA_MOBILE_ENTITY || '(미설정)'}`);
    console.log('=========================================');
    await askQuestion(rl, '메인 메뉴로 돌아가려면 엔터(Enter) 키를 누르세요...');
}

async function promptSensitiveKeyIfNeeded(rl, label, currentValue, isRequired = false) {
    if (currentValue && currentValue.trim() !== '') {
        console.log(`[보호] ${label}: ${GREEN}🔒 수정 및 삭제는 .env에서 직접 처리${RESET}`);
        return currentValue;
    }
    const reqMark = isRequired ? `${RED}*(필수)${RESET}` : '(선택)';
    const input = await askQuestion(rl, `🔑 ${label} 입력 ${reqMark}: `);
    return input.trim() || currentValue;
}

// --------------------------------------------------
// 개별 설정 서브 모듈 함수 정의 (마법사 모드 및 개별 메뉴 공용)
// --------------------------------------------------

async function configureAIProvider(rl, state, isWizard = false) {
    clearConsole();
    console.log('--- [Step 1] AI Provider 선택 ---');
    console.log('1. OLLAMA (로컬 추론)');
    console.log('2. GEMINI (Google Gemini API)');
    console.log('3. CHATGPT (OpenAI ChatGPT API)');
    if (!isWizard) console.log('0. 뒤로 가기 (변경 없음)');
    console.log('----------------------------');
    const providerSelect = await askQuestion(rl, '선택 (1~3): ');
    if (providerSelect === '1') state.AI_PROVIDER = 'OLLAMA';
    else if (providerSelect === '2') state.AI_PROVIDER = 'GEMINI';
    else if (providerSelect === '3') state.AI_PROVIDER = 'CHATGPT';
}

async function configureAIModelAndKey(rl, state, isWizard = false) {
    clearConsole();
    console.log('--- [Step 2] AI 모델 및 API Key 세부 설정 ---');
    if (state.AI_PROVIDER === 'OLLAMA') {
        const ipInput = await askQuestion(rl, `Ollama IP주소 입력 (현재: ${state.LOCAL_AI_IP || '(비어있음 - 자동탐색)'}, 엔터 시 유지): `);
        if (ipInput.trim() !== '') state.LOCAL_AI_IP = ipInput.trim();
        
        const modelInput = await askQuestion(rl, `Ollama 모델명 입력 (현재 기본값: ${state.OLLAMA_MODEL}): `);
        if (modelInput.trim() !== '') state.OLLAMA_MODEL = modelInput.trim();
    } else if (state.AI_PROVIDER === 'GEMINI') {
        const modelInput = await askQuestion(rl, `Gemini 모델명 입력 (현재 기본값: ${state.GEMINI_MODEL}): `);
        if (modelInput.trim() !== '') state.GEMINI_MODEL = modelInput.trim();
        
        state.GEMINI_API_KEY = await promptSensitiveKeyIfNeeded(rl, 'Gemini API Key (GEMINI_API_KEY)', state.GEMINI_API_KEY, true);
    } else if (state.AI_PROVIDER === 'CHATGPT') {
        const modelInput = await askQuestion(rl, `ChatGPT 모델명 입력 (현재 기본값: ${state.OPENAI_MODEL}): `);
        if (modelInput.trim() !== '') state.OPENAI_MODEL = modelInput.trim();
        
        state.OPENAI_API_KEY = await promptSensitiveKeyIfNeeded(rl, 'OpenAI API Key (OPENAI_API_KEY)', state.OPENAI_API_KEY, true);
    }
    if (!isWizard) await askQuestion(rl, '\n엔터(Enter) 키를 누르시면 메뉴로 이동합니다...');
}

async function configureNotifyChannel(rl, state, isWizard = false) {
    clearConsole();
    console.log('--- [Step 3] 알림 채널 선택 ---');
    console.log('1. TELEGRAM 메시지 전송');
    console.log('2. Home Assistant 모바일 NOTIFY 전송');
    console.log('3. BOTH (둘 다 동시 전송)');
    if (!isWizard) console.log('0. 뒤로 가기 (변경 없음)');
    console.log('----------------------------');
    const notifySelect = await askQuestion(rl, '선택 (1~3): ');
    if (notifySelect === '1') state.NOTIFY_CHANNEL = 'TELEGRAM';
    else if (notifySelect === '2') state.NOTIFY_CHANNEL = 'HA_NOTIFY';
    else if (notifySelect === '3') state.NOTIFY_CHANNEL = 'BOTH';

    // 단독 메뉴 진입 시 미설정 토큰 안내 친절 서비스
    if (!isWizard) {
        let missingToken = false;
        if ((state.NOTIFY_CHANNEL === 'TELEGRAM' || state.NOTIFY_CHANNEL === 'BOTH') && !state.TELEGRAM_BOT_TOKEN) missingToken = true;
        if ((state.NOTIFY_CHANNEL === 'HA_NOTIFY' || state.NOTIFY_CHANNEL === 'BOTH') && !state.HA_TOKEN) missingToken = true;
        
        if (missingToken) {
            console.log(`\n${YELLOW}💡 선택하신 알림 채널의 필수 토큰이 미설정 상태입니다.${RESET}`);
            console.log(`${CYAN}   메인 메뉴의 [4]번 메뉴(알림 토큰 및 Chat ID 설정)에서 입력을 진행할 수 있습니다.${RESET}`);
        }
    }
}

async function configureNotifyDestination(rl, state, isWizard = false) {
    clearConsole();
    console.log('--- [Step 4] 알림 목적지 및 토큰 세부 설정 ---');
    if (state.NOTIFY_CHANNEL === 'TELEGRAM' || state.NOTIFY_CHANNEL === 'BOTH') {
        state.TELEGRAM_CHAT_ID = await promptSensitiveKeyIfNeeded(rl, '텔레그램 Chat ID (TELEGRAM_CHAT_ID)', state.TELEGRAM_CHAT_ID, true);
        state.TELEGRAM_BOT_TOKEN = await promptSensitiveKeyIfNeeded(rl, '텔레그램 Bot Token (TELEGRAM_BOT_TOKEN)', state.TELEGRAM_BOT_TOKEN, true);
    }
    if (state.NOTIFY_CHANNEL === 'HA_NOTIFY' || state.NOTIFY_CHANNEL === 'BOTH') {
        const urlInput = await askQuestion(rl, `Home Assistant 주소 입력 (현재 기본값: ${state.HA_URL}): `);
        if (urlInput.trim() !== '') state.HA_URL = urlInput.trim();

        const entityInput = await askQuestion(rl, `스마트폰 기기명 입력 (현재: ${state.HA_MOBILE_ENTITY || '(미설정)'}): `);
        if (entityInput.trim() !== '') state.HA_MOBILE_ENTITY = entityInput.trim();

        state.HA_TOKEN = await promptSensitiveKeyIfNeeded(rl, 'Home Assistant Token (HA_TOKEN)', state.HA_TOKEN, true);
    }
    if (!isWizard) await askQuestion(rl, '\n엔터(Enter) 키를 누르시면 메뉴로 이동합니다...');
}

async function configureAccountAndDocs(rl, state, isWizard = false) {
    clearConsole();
    console.log('--- [Step 5] 계정 및 구글 문서 설정 ---');
    const naverIdInput = await askQuestion(rl, `네이버 이메일 주소 입력 (현재: ${getMaskedEmail(state.NAVER_ID)}, 예: user@naver.com): `);
    if (naverIdInput.trim() !== '') state.NAVER_ID = naverIdInput.trim();

    state.NAVER_PW = await promptSensitiveKeyIfNeeded(rl, '네이버 IMAP 전용 보안키 (웹로그인 비번X) (NAVER_PW)', state.NAVER_PW, true);

    const docIdInput = await askQuestion(rl, `구글 문서 ID (GOOGLE_DOC_ID) 입력 (현재 기본값: ${getMaskedDocId(state.GOOGLE_DOC_ID)}): `);
    if (docIdInput.trim() !== '') state.GOOGLE_DOC_ID = docIdInput.trim();

    if (!isWizard) await askQuestion(rl, '\n엔터(Enter) 키를 누르시면 메뉴로 이동합니다...');
}

// 전체 연속 설정 진행 (마법사 모드)
async function runWizardMode(rl, state) {
    clearConsole();
    console.log('==================================================');
    console.log('   🚀 전체 설정 마법사');
    console.log('   Step 1부터 Step 5까지 빠짐없이 순차 진행합니다.');
    console.log('   (기존값을 유지하시려면 그냥 엔터(Enter)를 누르세요)');
    console.log('==================================================');
    await askQuestion(rl, '시작하시려면 엔터(Enter) 키를 누르세요...');

    await configureAIProvider(rl, state, true);
    await configureAIModelAndKey(rl, state, true);
    await configureNotifyChannel(rl, state, true);
    await configureNotifyDestination(rl, state, true);
    await configureAccountAndDocs(rl, state, true);

    clearConsole();
    console.log(`${GREEN}==================================================${RESET}`);
    console.log(`${GREEN}🎉 전체 설정 마법사 완료! 메인 메뉴에서 저장(0번)을 선택하세요.${RESET}`);
    console.log(`${GREEN}==================================================${RESET}`);
    await askQuestion(rl, '메인 메뉴로 돌아가려면 엔터(Enter) 키를 누르세요...');
}

async function startCLI() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const { config } = await readEnv();
    
    let state = {
        NAVER_ID: config.NAVER_ID || '',
        NAVER_PW: config.NAVER_PW || '',
        GOOGLE_DOC_ID: config.GOOGLE_DOC_ID || '',
        AI_PROVIDER: config.AI_PROVIDER || 'OLLAMA',
        OLLAMA_MODEL: config.OLLAMA_MODEL || 'qwen2.5:3b',
        LOCAL_AI_IP: config.LOCAL_AI_IP || '',
        GEMINI_API_KEY: config.GEMINI_API_KEY || '',
        GEMINI_MODEL: config.GEMINI_MODEL || 'gemini-3.6-flash',
        OPENAI_API_KEY: config.OPENAI_API_KEY || '',
        OPENAI_MODEL: config.OPENAI_MODEL || 'gpt-4o-mini',
        NOTIFY_CHANNEL: config.NOTIFY_CHANNEL || 'TELEGRAM',
        TELEGRAM_BOT_TOKEN: config.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_CHAT_ID: config.TELEGRAM_CHAT_ID || '',
        HA_URL: config.HA_URL || 'http://homeassistant.local:8123',
        HA_TOKEN: config.HA_TOKEN || '',
        HA_MOBILE_ENTITY: config.HA_MOBILE_ENTITY || ''
    };

    while (true) {
        const missingKeys = [];
        if (!state.NAVER_ID) missingKeys.push('NAVER_ID');
        if (!state.NAVER_PW) missingKeys.push('NAVER_PW');
        if (!state.GOOGLE_DOC_ID) missingKeys.push('GOOGLE_DOC_ID');
        if (state.AI_PROVIDER === 'GEMINI' && !state.GEMINI_API_KEY) missingKeys.push('GEMINI_API_KEY');
        if (state.AI_PROVIDER === 'CHATGPT' && !state.OPENAI_API_KEY) missingKeys.push('OPENAI_API_KEY');
        if ((state.NOTIFY_CHANNEL === 'TELEGRAM' || state.NOTIFY_CHANNEL === 'BOTH') && !state.TELEGRAM_CHAT_ID) missingKeys.push('TELEGRAM_CHAT_ID');
        if ((state.NOTIFY_CHANNEL === 'TELEGRAM' || state.NOTIFY_CHANNEL === 'BOTH') && !state.TELEGRAM_BOT_TOKEN) missingKeys.push('TELEGRAM_BOT_TOKEN');
        if ((state.NOTIFY_CHANNEL === 'HA_NOTIFY' || state.NOTIFY_CHANNEL === 'BOTH') && !state.HA_TOKEN) missingKeys.push('HA_TOKEN');

        clearConsole();
        console.log('=========================================');
        console.log('   Mail-Automator v2.0 동적 보안 설정 메뉴');
        console.log('=========================================');
        if (missingKeys.length > 0) {
            console.log(`${YELLOW}💡 필수 정보를 입력해주세요 (.env에서 직접 입력도 가능)${RESET}`);
            console.log(`${CYAN}     (${missingKeys.join(', ')})${RESET}`);
            console.log('-----------------------------------------');
        } else {
            console.log(`${GREEN}✅ 모든 필수 보안 키 및 설정이 완료된 상태입니다.${RESET}`);
            console.log('-----------------------------------------');
        }
        console.log(`${CYAN}[A] 🚀 전체 설정 마법사${RESET}`);
        console.log('-----------------------------------------');
        console.log(`[1] AI Provider 선택        (현재: ${state.AI_PROVIDER})`);
        console.log(`[2] AI 모델 및 API Key 설정 (서버 주소/모델/토큰)`);
        console.log(`[3] 알림 채널 선택          (현재: ${state.NOTIFY_CHANNEL})`);
        console.log(`[4] 🔑 알림 토큰 및 Chat ID 설정 (TELEGRAM/HA 토큰 및 기기명)`);
        console.log(`[5] 계정 및 구글 문서 설정 (NAVER 계정 & Doc ID)`);
        console.log(`[6] 🔑 토큰/API Key 발급처 가이드 도움말`);
        console.log(`[7] 🔍 현재 전체 설정 상태 조회`);
        console.log('-----------------------------------------');
        console.log(`${GREEN}[0] 💾 저장 및 종료 (Save & Exit)${RESET}`);
        console.log('=========================================');
        
        const menuSelect = await askQuestion(rl, '메뉴 번호를 선택하세요: ');
        const upperSelect = menuSelect.trim().toUpperCase();

        if (upperSelect === 'A') {
            await runWizardMode(rl, state);
        }
        else if (menuSelect === '1') {
            await configureAIProvider(rl, state);
        } 
        else if (menuSelect === '2') {
            await configureAIModelAndKey(rl, state);
        } 
        else if (menuSelect === '3') {
            await configureNotifyChannel(rl, state);
        } 
        else if (menuSelect === '4') {
            await configureNotifyDestination(rl, state);
        }
        else if (menuSelect === '5') {
            await configureAccountAndDocs(rl, state);
        }
        else if (menuSelect === '6') {
            await showHelpMenu(rl);
        }
        else if (menuSelect === '7') {
            await viewCurrentSettings(rl, state);
        }
        else if (menuSelect === '0') {
            const confirmSave = await askQuestion(rl, '\n변경 사항을 저장하고 종료하시겠습니까? (Y/N): ');
            if (confirmSave.toLowerCase() === 'y') {
                await writeEnv(state);
                console.log(`${GREEN}[진행 내용] 설정 변경 사항이 .env에 성공적으로 저장되었습니다.${RESET}`);
            } else {
                console.log('[진행 내용] 변경 사항이 저장되지 않고 종료되었습니다.');
            }
            break;
        }
        else {
            console.log('⚠️ 잘못된 입력값입니다.');
            await askQuestion(rl, '엔터를 누르면 계속합니다...');
        }
    }
    
    rl.close();
}

startCLI();
