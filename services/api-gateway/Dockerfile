# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy and build the aws-services dependency first
COPY packages/aws-services/package.json ./packages/aws-services/
RUN cd packages/aws-services && npm install --ignore-scripts

COPY packages/aws-services/ ./packages/aws-services/
RUN cd packages/aws-services && npm run build

# Install api-gateway dependencies (with local package link)
COPY services/api-gateway/package.json ./services/api-gateway/
WORKDIR /app/services/api-gateway
RUN npm install --ignore-scripts --install-links=false; \
    rm -rf node_modules/@vaidyah/aws-services && \
    mkdir -p node_modules/@vaidyah/aws-services && \
    cp -r /app/packages/aws-services/dist node_modules/@vaidyah/aws-services/dist && \
    cp /app/packages/aws-services/package.json node_modules/@vaidyah/aws-services/package.json && \
    cd node_modules/@vaidyah/aws-services && npm install --omit=dev --ignore-scripts

# Copy source and build
COPY services/api-gateway/tsconfig.json ./
COPY services/api-gateway/src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production; \
    rm -rf node_modules/@vaidyah/aws-services && \
    mkdir -p node_modules/@vaidyah/aws-services && \
    cp -r /app/packages/aws-services/dist node_modules/@vaidyah/aws-services/dist && \
    cp /app/packages/aws-services/package.json node_modules/@vaidyah/aws-services/package.json && \
    cd node_modules/@vaidyah/aws-services && npm install --omit=dev --ignore-scripts

# ---- Production Stage ----
FROM node:20-alpine AS production

# Security: run as non-root; dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S vaidyah && \
    adduser -S vaidyah -u 1001 -G vaidyah

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=vaidyah:vaidyah /app/services/api-gateway/dist ./dist
COPY --from=builder --chown=vaidyah:vaidyah /app/services/api-gateway/node_modules ./node_modules
COPY --from=builder --chown=vaidyah:vaidyah /app/services/api-gateway/package.json ./package.json

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
