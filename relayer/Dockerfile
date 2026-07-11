# syntax=docker/dockerfile:1
# KickTick Relayer — Node.js 22 + TypeScript
# Build: docker build -t kicktick-relayer .
# Run dev:  docker run --rm -it -v $(pwd):/app -p 8080:8080 kicktick-relayer npm run dev
# Run prod: docker run --rm -it -p 8080:8080 kicktick-relayer npm start

FROM node:22-alpine AS base
WORKDIR /app

# Install build deps for native modules (ws, etc.)
RUN apk add --no-cache python3 make g++ git

# --- Dependencies stage ---
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- Build stage ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- Dev stage (hot-reload via volume mount) ---
FROM deps AS dev
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev"]

# --- Prod stage ---
FROM base AS prod
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
EXPOSE 8080
CMD ["npm", "start"]
