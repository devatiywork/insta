FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 build-base && \
    npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# yt-dlp нужен Python; ffmpeg — для merge DASH-стримов и аудио-экстракта
RUN apk add --no-cache ffmpeg python3 py3-pip ca-certificates && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir yt-dlp
ENV PATH="/opt/venv/bin:$PATH"

COPY package.json package-lock.json* ./
# build-base нужен на случай, если для better-sqlite3 нет prebuilt под musl
RUN apk add --no-cache --virtual .build build-base && \
    npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force && \
    apk del .build
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
CMD ["node", "dist/main.js"]
