const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file'
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * 이전에 저장된 토큰이 있으면 읽어오고 없다면 새로 인증을 수행합니다.
 */
async function authorize() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // 이전에 저장된 토큰 확인
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // 토큰이 없으면 새로운 토큰 발급
  return getNewToken(oAuth2Client);
}

/**
 * 새로운 토큰을 발급받기 위해 사용자에게 인증 URL을 제공합니다.
 */
function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  console.log('----------------------------------------------------');
  console.log('이 앱을 승인하려면 브라우저에서 아래 주소로 접속하세요:');
  console.log(authUrl);
  console.log('----------------------------------------------------');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('페이지에서 받은 "Authorization Code"를 여기에 입력하세요: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return reject(err);
        oAuth2Client.setCredentials(token);
        // 토큰 파일 시스템에 저장
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('[Success] token.json 이 성공적으로 생성되었습니다.');
        resolve(oAuth2Client);
      });
    });
  });
}

if (require.main === module) {
  authorize().then(() => {
    console.log('[Success] 인증 작업이 완료되었습니다.');
    process.exit(0);
  }).catch((err) => {
    console.error('[Error] 인증 중 오류 발생:', err);
    process.exit(1);
  });
}

module.exports = {
  authorize,
};
