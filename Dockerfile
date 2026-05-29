FROM node:20-alpine

# 작업 디렉토리 생성
WORKDIR /app

# 패키지 파일 복사 및 설치 (프로덕션 환경 최적화)
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY src/ ./src
COPY index.js ./

# 기본 실행 명령
CMD ["node", "index.js"]
