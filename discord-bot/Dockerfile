FROM node:20.18.1-alpine3.20 AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

RUN addgroup -S dune && adduser -S dune -G dune

USER dune

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "scripts/runtime-smoke.mjs"]
