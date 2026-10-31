FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# SQLite catalog lives here (mounted as a volume in docker-compose)
RUN mkdir -p /app/data && chown node:node /app/data

ENV PORT=8000
EXPOSE 8000

USER node
CMD ["node", "src/server.js"]
