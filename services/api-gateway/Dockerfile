# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package.json ./
RUN npm install --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ---- Production Stage ----
FROM node:20-alpine AS production

# Security: run as non-root; dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S vaidyah && \
    adduser -S vaidyah -u 1001 -G vaidyah

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=vaidyah:vaidyah /app/dist ./dist
COPY --from=builder --chown=vaidyah:vaidyah /app/node_modules ./node_modules
COPY --from=builder --chown=vaidyah:vaidyah /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER vaidyah

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
