FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=8000
EXPOSE 8000

USER node
CMD ["node", "src/server.js"]
