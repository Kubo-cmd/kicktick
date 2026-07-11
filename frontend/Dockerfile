# syntax=docker/dockerfile:1
# KickTick Frontend — Vite + React + Node.js 22

FROM node:22-alpine AS base
WORKDIR /app

# --- Dependencies stage ---
FROM base AS deps
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev
COPY package*.json ./
RUN npm ci

# --- Build stage ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- Dev stage ---
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Prod stage (nginx for static serving) ---
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
