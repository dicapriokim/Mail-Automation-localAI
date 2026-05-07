import requests
import json
import os
import sys
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# --- [1. 환경별 인코딩 방어 (Windows 대응)] ---
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

# --- [2. 안티 그래비티 서버 무결성 설정] ---
REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")
CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")
REDIRECT_URI = "http://localhost:3000"

# 하이브리드 경로 설정 (노트북 D:\... vs 서버 /opt/...)
base_dir = os.path.dirname(os.path.abspath(__file__))
default_token_path = os.path.join(base_dir, "kakao_token.json")
TOKEN_PATH = os.getenv("KAKAO_TOKEN_PATH", default_token_path)

def save_tokens(tokens):
    with open(TOKEN_PATH, "w") as f:
        json.dump(tokens, f)

def load_tokens():
    if not os.path.exists(TOKEN_PATH):
        return None
    with open(TOKEN_PATH, "r") as f:
        return json.load(f)

def refresh_kakao_token():
    tokens = load_tokens()
    if not tokens: return None
    url = "https://kauth.kakao.com/oauth/token"
    data = {
        "grant_type": "refresh_token",
        "client_id": REST_API_KEY,
        "client_secret": CLIENT_SECRET,
        "refresh_token": tokens["refresh_token"]
    }
    response = requests.post(url, data=data)
    new_tokens = response.json()
    if "access_token" in new_tokens:
        tokens["access_token"] = new_tokens["access_token"]
        if "refresh_token" in new_tokens:
            tokens["refresh_token"] = new_tokens["refresh_token"]
        save_tokens(tokens)
        return tokens["access_token"]
    return tokens.get("access_token")

def send_to_me(message_text):
    access_token = refresh_kakao_token()
    if not access_token: 
        print("🚨 토큰 갱신 실패. 다시 인증이 필요할 수 있습니다.")
        return

    # 구글 독스 URL 구성
    DOC_ID = os.getenv("GOOGLE_DOC_ID")
    DOCS_URL = f"https://docs.google.com/document/d/{DOC_ID}/edit"

    url = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
    headers = {"Authorization": f"Bearer {access_token}"}
    template = {
        "object_type": "text",
        "text": message_text,
        "link": {
            "web_url": DOCS_URL, 
            "mobile_web_url": DOCS_URL
        },
        "button_title": "메일 요약 확인"
    }
    res = requests.post(url, headers=headers, data={"template_object": json.dumps(template)})
    if res.status_code == 200: 
        print("✅ 카카오톡 메시지 전송 성공!")
    else: 
        print(f"❌ 전송 실패 ({res.status_code}):", res.json())

if __name__ == "__main__":
    # 실행 시 인자값이 있으면 메시지로 사용, 없으면 기본 메시지 사용
    if len(sys.argv) > 1:
        msg_content = sys.argv[1]
    else:
        msg_content = "돼지지렁이님, 안티 그래비티 비서가 메일 요약을 완료했습니다! 🚀"
        
    send_to_me(msg_content)