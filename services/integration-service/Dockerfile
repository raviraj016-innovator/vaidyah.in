# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S vaidyah && \
    adduser -S vaidyah -u 1001 -G vaidyah

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN chown -R vaidyah:vaidyah /app

USER vaidyah

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:3002/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
