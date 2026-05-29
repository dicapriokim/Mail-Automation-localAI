# 🚀 Antigravity Mail Local (Mail-Automator Local)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker Support](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)

[한국어 설명서는 여기를 클릭하세요 (Korean README)](README.md)

**Antigravity Mail Local** is a smart mail assistant system that automatically fetches and summarizes newsletters from Gmail and Naver Mail, compiles them into a Google Docs report, and sends instant Telegram notifications. This project is optimized to run using a **local LLM server (LocalAI)** and **Docker** to enhance privacy and minimize cloud infrastructure costs.

## 🌟 Key Features

- **📧 Multi-channel Mail Integration**: Supports Gmail API and Naver IMAP to collect emails from multiple channels.
- **🧠 Local AI Engine (LocalAI)**: Employs standard OpenAI-compatible API protocol and a lightweight local AI model (**qwen-1.5b**) to process data securely and cost-effectively.
- **🐳 Docker & Docker Compose Support**: Isolates the execution environment using containers. Containers run once and are automatically destroyed to eliminate idle resource waste.
- **🏗️ Batch Fetch & Close Architecture**: Closes the IMAP connection immediately after fetching emails to prevent ECONNRESET errors caused by inference latency.
- **📊 Performance Profiling**: Automatically measures and reports elapsed processing time and total processed email counts via terminal logs and Telegram notifications.
- **📬 Telegram Bot Notifications**: Instantly alerts completion of tasks including elapsed time, mail count, and direct Google Docs links formatted in clean Markdown.
- **🛡️ Robust Design & Error Handling**:
  - **120-second Timeout**: Avoids inference hangs using `AbortController`.
  - **JSON Parsing Resilience**: Automatically sanitizes markdown blocks (```json ... ```) within LLM responses for reliable parsing.
  - **Error Isolation**: Individual mail processing failures do not stop the pipeline; safe fallbacks are applied automatically.
- **🧹 Auto-Cleanup**: Automatically detects promotions, advertisements, or simple notifications and moves them to the trash.
- **💎 Premium Style Guide**: Minimizes visual clutter in Google Docs, applying unified colors, typography, and clear indentations.
- **🕐 Document Integrity Management**: Appends the final update timestamp at the bottom right of the report using a premium style (9PT, Italic, Gray) in KST.

## 🛠 Tech Stack

- **Main Engine**: Node.js (v18+) / Docker (Alpine Linux)
- **AI Model**: LocalAI / qwen-1.5b (OpenAI Chat Completions API Compatible)
- **Notify Service**: Telegram Bot API
- **APIs**: Gmail API, Google Docs API, Google Drive API
- **Protocols**: IMAP (for Naver Mail)
- **Architecture**: Batch Fetch & Close

## 🔄 Model Swap

You can swap the active AI model instantly by simply changing the environment variable in `.env` without modifying or rebuilding the codebase.

```env
# Configuration in .env
LLM_MODEL=your_target_model_name (e.g., qwen-1.5b)
```

* **Note**: If `LLM_MODEL` is left blank or omitted in your `.env`, it automatically falls back to the default build configuration: **`qwen-1.5b`**.

## 🔑 Integration Setup Guide

### 1. Naver Mail Configuration
You must enable external application access for Naver Mail to read inbox data over IMAP.

1. **Enable IMAP Access**:
   * Log in to Naver Mail (Web).
   * Click **Settings** (gear icon) at the bottom left sidebar.
   * Go to **POP3/IMAP Settings** ➡️ **IMAP/SMTP Settings** tab.
   * Select **'Enable'** for IMAP/SMTP and save.
2. **Issue Application Password (Required if 2-Step Verification is active)**:
   * Go to your Naver Account Settings.
   * Go to **Security Settings** ➡️ **Password** ➡️ **2-step Verification** management page.
   * Under **Application Password**, select `Outlook` or `Other` and click Generate.
   * Copy the generated **12-digit capitalized password** and insert it as `NAVER_PW` in `.env`. (Your default password will be blocked for API logins).

### 2. Google API Credentials (credentials.json) Setup
A Google Cloud project is required to link Gmail and Google Docs.

1. **Create Google Cloud Project**:
   * Log in to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. **Enable Required APIs**:
   * Search and enable the following APIs:
     * `Gmail API`
     * `Google Docs API`
     * `Google Drive API`
3. **OAuth Consent Screen**:
   * Go to OAuth Consent Screen menu.
   * Set User Type to **External**, enter app info, and save.
   * Under **Test Users**, make sure to add **your own Google Email address** (where you receive emails and edit docs).
4. **Download credentials.json**:
   * Go to Credentials menu ➡️ Click **Create Credentials** ➡️ Select **OAuth client ID**.
   * Choose Application type as **Desktop App** and create.
   * Download the JSON file, rename it to **`credentials.json`**, and place it in the root folder of the project.
5. **Generate Authentication Token (token.json)**:
   * Run `node index.js` for the first time. A browser window will open or a link will print in the console.
   * Log in using your Google account and grant permissions.
   * **⚠️ Crucial (Bypassing Verification Warning)**: Since this is a personal development app, you will see a warning: **"This app isn't verified"**.
     * Click **'Advanced'** at the bottom left.
     * Click **'Go to Antigravity (unsafe)'** to proceed.
   * Once authentication finishes, **`token.json`** will be generated automatically in your workspace root, and no further browser logins are required.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+) or Docker installed.
- **LocalAI Server Setup**: LocalAI is a lightweight self-hosted AI engine that emulates the OpenAI API. Please refer to [LocalAI-miniPC Repository](https://github.com/dicapriokim/LocalAI-miniPC) to build the local AI server and load `qwen-1.5b` first.
- Google Cloud API credentials (`credentials.json`) and OAuth access token (`token.json`) verified.
- Telegram Bot token created via BotFather.

### 2. Installation
```bash
git clone https://github.com/dicapriokim/Mail-Automation-localAI.git
cd Mail-Automation-localAI
```

### 3. Environment Variables Configuration (`.env`)
Create a `.env` file in the root folder.

```env
LOCALAI_API_URL=http://your_localai_ip:8080/v1/chat/completions
LLM_MODEL=qwen-1.5b
NAVER_ID=your_id@naver.com
NAVER_PW=your_app_password
GOOGLE_DOC_ID=your_google_doc_id
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

| Variable | Description |
|------|------|
| `LOCALAI_API_URL` | The API address of the LocalAI server setup by following the [LocalAI-miniPC](https://github.com/dicapriokim/LocalAI-miniPC) guide (e.g., `http://192.168.0.33:8080/v1/chat/completions`) |
| `LLM_MODEL` | The model identifier registered in LocalAI (defaults to: `qwen-1.5b`) |
| `NAVER_ID` / `NAVER_PW` | Naver account ID and password (※ **`NAVER_ID` must be the full email address format including `@naver.com`**) |
| `GOOGLE_DOC_ID` | The ID of the target Google Document (refer to URL format below) |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token issued by messaging `@BotFather` and sending `/newbot` command |
| `TELEGRAM_CHAT_ID` | Telegram numeric chat ID. Get it by messaging `@userinfobot` or `@GetMyChatID_Bot` |

> 💡 **How to find GOOGLE_DOC_ID**:
> Look at the address bar of your browser while viewing your Google Doc.
> 
> * **Google Doc URL format**:
>   `https://docs.google.com/document/d/1A2B3C4D5E6F7G8H9I0J_abc123XYZ/edit`
> 
> The long random string `1A2B3C4D5E6F7G8H9I0J_abc123XYZ` located between `d/` and `/edit` is your unique Document ID.

---

### 4. Running the Application

#### Method A: Standard Local Execution (Via CMD / PowerShell)
```bash
npm install
node index.js
```
*(On Windows, you can simply double-click the pre-configured `run_automator.bat` file.)*

#### Method B: Containerized Execution (Recommended for Servers / LXC)
```bash
# Build the image
docker compose build

# Single-run execution test
docker compose up
```

---

## 📅 Server Scheduler Setup (LXC / Linux)

To run the mail assistant automatically everyday, add the following cron line inside `crontab -e`. The configuration below runs at 15:10 (3:10 PM) daily and automatically cleans up the container after running.

```cron
10 15 * * * cd /opt/Mail-Automator && /usr/bin/docker compose run --rm mail-automator >> /opt/Mail-Automator/cron.log 2>&1
```

---

## ⚠️ Troubleshooting & Security

1. **Credentials Isolation**: `token.json`, `credentials.json`, and `.env` files contain sensitive information and are strictly ignored by `.gitignore` and `.dockerignore`.
2. **Docker Volumes Mounting**: Runtime configurations are mounted dynamically to keep key configurations outside the build image.
3. **IMAP Stability**: Implements the Batch Fetch & Close pattern to close active sessions immediately, avoiding IMAP Idle timeouts (ECONNRESET) during inference.

## 📄 License

This project is licensed under the MIT License.  
Copyright (c) 2026 **돼지지렁이**. All rights reserved.

### 👑 Developer
- **돼지지렁이** (Antigravity Developer)
