FROM node:20-bookworm AS web-build
WORKDIR /app/web
COPY web/package.json ./
COPY web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM node:20-bookworm
WORKDIR /app
ENV NODE_ENV=production

# Runtime tools required by RedBlink dune scripts when the web admin runs in a container.
# docker.io provides the docker CLI for talking to the mounted host Docker socket.
# iproute2 provides ss, used by readiness/listener checks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        docker.io \
        iproute2 \
        ca-certificates \
        curl \
        bash \
        procps \
        netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

COPY admin-server/package.json ./
COPY admin-server/package-lock.json ./
RUN npm ci --omit=dev
COPY admin-server/src ./src
COPY --from=web-build /app/web/dist /app/web-dist
WORKDIR /repo
EXPOSE 8088
CMD ["node", "/app/src/server.js"]
