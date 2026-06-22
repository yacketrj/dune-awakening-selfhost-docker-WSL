FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture i386 \
 && apt-get update -y \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tar \
    gzip \
    unzip \
    jq \
    git \
    python3 \
    python3-yaml \
    procps \
    util-linux \
    lib32gcc-s1 \
    lib32stdc++6 \
    docker.io \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash dune \
 && mkdir -p \
    /home/dune/.steam \
    /srv/dune/server \
    /srv/dune/steam \
    /srv/dune/generated \
    /srv/dune/cache \
 && chown -R dune:dune /home/dune /srv/dune

COPY dune_orchestrator.py /usr/local/bin/dune
RUN chmod +x /usr/local/bin/dune

# The orchestrator starts as root to chown mounted volumes, then uses runuser for SteamCMD.
# nosemgrep: dockerfile.security.last-user-is-root.last-user-is-root - Orchestrator starts as root to chown mounted volumes, then uses runuser for SteamCMD.
USER root #trivy:ignore:AVD-DS-0002
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint - Orchestrator starts as root to chown mounted volumes, then uses runuser for SteamCMD.
ENTRYPOINT ["/usr/local/bin/dune"]
# nosemgrep: dockerfile.security.missing-user.missing-user - Orchestrator starts as root to chown mounted volumes, then uses runuser for SteamCMD.
CMD ["help"]
