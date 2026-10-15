# The sandbox image an agent runs inside.
#
# Sandcastle needs four things from this file, and they must stay: a non-root `agent` user
# (Claude Code refuses to run as root), `git` for the commits, `gh` for the
# issues, and `claude` on PATH. pnpm is Location Scout's own addition, for the
# TypeScript workspace, and so is Chromium, for the end-to-end tests.
#
# Node and pnpm are pinned to fixed versions within the ranges the root
# package.json allows (`engines` / `devEngines`: Node >= 26, pnpm >= 12), the
# same versions CI uses. If those ranges move, keep these inside them.
FROM node:26.10.0-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  curl \
  jq \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI: the agent reads the issue it is working on and comments on it.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# pnpm, at the version CI uses. Node no longer ships corepack from
# version 25, so pnpm is installed directly. `devEngines.packageManager` in
# package.json remains the source of truth.
RUN npm install -g pnpm@12.10.0

# UID/GID alignment. `sandcastle docker build-image` defaults these to the host
# user's, so files the image writes and files the bind mount writes have the same
# owner.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Chromium and the system libraries it needs, for `pnpm test:e2e` (PRD
# NFR-3.2). The libraries need root, so they are installed here. The browser
# goes in a shared folder the agent owns: if @playwright/test in
# apps/web/package.json moves on, the `onSandboxReady` hook in main.ts fetches
# the matching browser into it. Keep this version in step to skip that download.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@1.63.0 install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R $AGENT_UID:$AGENT_GID /ms-playwright

# Rename the base image's `node` user to `agent` and align its UID/GID.
RUN groupmod -o -g $AGENT_GID node \
  && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/agent/.local/bin:$PATH"

# Sandcastle bind-mounts the git worktree here and makes it the working
# directory at container start.
WORKDIR /home/agent/workspace

ENTRYPOINT ["sleep", "infinity"]
