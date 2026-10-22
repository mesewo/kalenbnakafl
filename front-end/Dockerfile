FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_INTERNAL_URL=http://api:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 CMD node -e "const req=require('http').get('http://127.0.0.1:3000/healthz', r => { r.resume(); if (r.statusCode !== 200) process.exitCode=1 }); req.setTimeout(9000, () => req.destroy(new Error('timeout'))); req.on('error', () => process.exit(1))"
CMD ["npm", "start"]
