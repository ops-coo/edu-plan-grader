# Stage 1: Install deps (including native build for better-sqlite3)
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:20-slim

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY dist/ ./dist/
COPY shared/ ./shared/
COPY data/ ./data/

# SQLite data is ephemeral in Cloud Run — BigQuery is the persistent backend
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
