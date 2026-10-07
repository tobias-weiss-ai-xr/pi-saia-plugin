# SAIA provider for the pi coding agent — container image.
#
# The image installs pi and then registers this repository as a pi package, so
# the container exercises exactly the same path a user takes
# (`pi install <path>` -> ~/.pi/agent/settings.json). The retired
# ~/.config/pi/plugins layout is intentionally not used: pi >= 0.84 never reads
# it. See KNOWN_ISSUES.md.

ARG NODE_VERSION=24
ARG ALPINE_VERSION=3.20
ARG PI_VERSION=latest

# =============================================================================
# Stage 1: builder — install deps, typecheck
# =============================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder

RUN apk add --no-cache \
    curl \
    jq \
    git \
    bash \
    bc \
    openssl \
    ca-certificates \
    tzdata \
    python3 \
    py3-yaml \
    py3-pip

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci 2>/dev/null || npm install

COPY . .

# Typecheck (non-fatal: a type error must not block a sandbox image)
RUN npm run tsc -- --noEmit --skipLibCheck 2>&1 || echo "TypeScript check: warnings only"

# =============================================================================
# Stage 2: runtime — pi + this package
# =============================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION}

ARG PI_VERSION

RUN apk add --no-cache \
    curl \
    jq \
    git \
    bash \
    bc \
    ca-certificates \
    tzdata

RUN npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}"

# Non-root user (the node user already owns UID 1000)
RUN adduser -D -s /bin/bash -G node pluginuser

COPY --from=builder --chown=node:node /app /home/pluginuser/app

RUN chmod +x /home/pluginuser/app/src/*.sh /home/pluginuser/app/install*.sh /home/pluginuser/app/scripts/*.sh

USER pluginuser
ENV NODE_ENV=production
ENV HOME=/home/pluginuser
WORKDIR /home/pluginuser/app

# Register the package with pi, exactly like a user would.
RUN pi install /home/pluginuser/app

# Default: an interactive shell with pi on PATH.
CMD ["bash"]

# =============================================================================
# Build instructions
# =============================================================================
# Development:   docker build -t pi-saia-plugin --target builder .
#                (this stage can run the full smoke suite: it has python3 +
#                 PyYAML for the workflow checks, which the runtime stage lacks)
# Production:    docker build -t pi-saia-plugin .
# Verify:        docker run --rm -e SAIA_API_KEY=... pi-saia-plugin \
#                  bash -c "pi --list-models | grep -c '^saia'"
# Multi-arch:    docker buildx build --platform linux/amd64,linux/arm64 \
#                  -t ghcr.io/tobias-weiss-ai-xr/pi-saia-plugin:latest --push .
