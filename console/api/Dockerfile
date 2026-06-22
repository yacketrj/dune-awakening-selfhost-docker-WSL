FROM node:24-trixie-slim AS web-build
WORKDIR /app/web
COPY console/web/package.json ./
COPY console/web/package-lock.json ./
RUN npm ci
COPY console/web ./
RUN npm run build

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
ARG DOCKER_CLI_VERSION=29.6.0
ARG DOCKER_COMPOSE_VERSION=v5.1.4

# Runtime tools required by RedBlink dune scripts when the web admin runs in a container.
# We install small OS tools through apt, then install Docker CLI + Compose plugin
# as standalone binaries to avoid pulling the heavy docker.io Debian package.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        iproute2 \
        ca-certificates \
        curl \
        bash \
        unzip \
        procps \
        netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
        amd64) docker_arch="x86_64"; compose_arch="x86_64" ;; \
        arm64) docker_arch="aarch64"; compose_arch="aarch64" ;; \
        *) echo "Unsupported architecture for Docker CLI: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_CLI_VERSION}.tgz" -o /tmp/docker.tgz \
    && tar -xzf /tmp/docker.tgz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && chmod +x /usr/local/bin/docker \
    && rm -rf /tmp/docker /tmp/docker.tgz \
    && mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${compose_arch}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
    && docker --version \
    && docker compose version \
    && groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid appuser --home-dir /app --shell /usr/sbin/nologin appuser \
    && mkdir -p /repo

COPY console/api/package.json ./
COPY console/api/package-lock.json ./
RUN npm ci --omit=dev
COPY console/api/src ./src
COPY --from=web-build /app/web/dist /app/web-dist
RUN rm -rf \
        /usr/local/bin/corepack \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/yarn \
        /usr/local/bin/yarnpkg \
        /usr/local/lib/node_modules/corepack \
        /usr/local/lib/node_modules/npm \
        /opt/yarn* \
    && chown -R appuser:appuser /app /repo
WORKDIR /repo
USER appuser
CMD ["node", "/app/src/server.js"]
