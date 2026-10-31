# Stage 1: Build static assets
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Minimal runtime
FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY server.js ./

ENV PORT=8000
EXPOSE 8000

USER node
CMD ["node", "server.js"]

