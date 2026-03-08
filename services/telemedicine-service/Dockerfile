FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini && addgroup -g 1001 vaidyah && adduser -u 1001 -G vaidyah -s /bin/sh -D vaidyah
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder --chown=vaidyah:vaidyah /app/dist ./dist
EXPOSE 8004
USER vaidyah
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
