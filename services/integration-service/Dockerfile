# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S vaidyah && \
    adduser -S vaidyah -u 1001 -G vaidyah

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R vaidyah:vaidyah /app

USER vaidyah

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
