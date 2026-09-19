# syntax=docker/dockerfile:1.6
# Dev container for Bastolk: NestJS + React (Node) in front, a QLoRA trainer
# (Python) behind, both in one box so the training job can be started as a
# child process from the Nest worker.
#
# GPU: nothing CUDA-related is installed here on purpose. Docker's `gpus: all`
# (compose) injects the NVIDIA driver stack from the Docker Desktop WSL2 VM —
# libcuda.so.1, nvidia-smi and the CUDA user-space libraries — and PyTorch's
# pip wheels ship their own CUDA runtime, cuDNN and ptxas on top of it.
# Installing cuda-drivers or the CUDA toolkit inside a WSL2 container
# overwrites the stubbed driver and breaks the GPU. See .devcontainer/README.md.
FROM python:3.12-slim-bookworm

ARG NODE_MAJOR=22
ARG PNPM_VERSION=10
ARG DEV_USER=dev
ARG DEV_UID=1000
ARG DEV_GID=1000

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

# ---- Base packages ----------------------------------------------------------
# libgomp1 is a PyTorch runtime dependency; postgresql-client gives psql
# against the postgres service; the rest is the house toolbox.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg xz-utils unzip \
        git build-essential \
        libgomp1 \
        postgresql-client redis-tools \
        ripgrep fd-find jq less vim \
        openssh-server sudo \
        locales tini \
 && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/*

# fd is installed as `fdfind` on Debian; provide the conventional `fd` alias.
RUN ln -s /usr/bin/fdfind /usr/local/bin/fd

# ---- Node.js (NodeSource) + pnpm + Claude Code ------------------------------
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "pnpm@${PNPM_VERSION}" @anthropic-ai/claude-code \
 && npm cache clean --force

# ---- Dev user ---------------------------------------------------------------
RUN groupadd --gid "${DEV_GID}" "${DEV_USER}" \
 && useradd  --uid "${DEV_UID}" --gid "${DEV_GID}" --create-home --shell /bin/bash "${DEV_USER}" \
 && echo "${DEV_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${DEV_USER}" \
 && chmod 0440 "/etc/sudoers.d/${DEV_USER}" \
 && install -d -m 0700 -o "${DEV_USER}" -g "${DEV_USER}" "/home/${DEV_USER}/.ssh" \
 && install -d -m 0755 -o "${DEV_USER}" -g "${DEV_USER}" \
        "/home/${DEV_USER}/.cache" "/home/${DEV_USER}/.local" \
        "/home/${DEV_USER}/.local/bin" "/home/${DEV_USER}/.local/share" \
        "/home/${DEV_USER}/.local/share/pnpm-store" \
        "/home/${DEV_USER}/.config" "/home/${DEV_USER}/.claude" \
        "/home/${DEV_USER}/.venv"

# pnpm's content-addressable store on the named volume, not the bind mount.
# Baked into the image so it survives the recreate Zed does on first attach.
RUN printf '%s\n' 'store-dir=/home/dev/.local/share/pnpm-store' \
        > "/home/${DEV_USER}/.npmrc" \
 && chown "${DEV_USER}:${DEV_USER}" "/home/${DEV_USER}/.npmrc"

# ---- Env for sshd/PAM login shells ------------------------------------------
# Docker ENV does not propagate into ssh sessions; PAM reads /etc/environment.
# PATH must keep the system dirs or ssh logins lose python/node/git/etc. The
# venv (/home/dev/.venv, a named volume — created on first start by the
# entrypoint) goes first so `python`/`pip` resolve to the container's trainer
# environment. The service URLs match docker-compose.yml.
RUN printf '%s\n' \
        'PATH="/home/dev/.venv/bin:/home/dev/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' \
        'VIRTUAL_ENV="/home/dev/.venv"' \
        'LANG="en_US.UTF-8"' \
        'DATABASE_URL="postgresql://bastolk:bastolk@postgres:5432/bastolk"' \
        'REDIS_URL="redis://redis:6379"' \
        'OLLAMA_BASE_URL="http://ollama:11434"' \
        'MODELS_DIR="/models"' \
        >> /etc/environment

# Non-login shells (VS Code terminals, docker exec) get the same via ENV.
ENV PATH="/home/${DEV_USER}/.venv/bin:/home/${DEV_USER}/.local/bin:${PATH}" \
    VIRTUAL_ENV="/home/${DEV_USER}/.venv" \
    MODELS_DIR="/models"

# ---- SSH server -------------------------------------------------------------
# Hardened sshd config (pubkey-only, no root, dev user only).
COPY --chmod=0644 .devcontainer/sshd_config /etc/ssh/sshd_config.d/00-dev.conf
RUN sed -i 's/\r$//' /etc/ssh/sshd_config.d/00-dev.conf

# Privilege separation directory required by sshd.
RUN install -d -m 0755 /var/run/sshd

# Entrypoint: install authorized_keys, generate host keys, exec sshd.
COPY --chmod=0755 .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh

# The repo is bind-mounted with host ownership; without this git refuses to
# operate ("dubious ownership") for both SSH and VS Code sessions.
RUN git config --system --add safe.directory /workspaces/bastolk

# ---- Git auth: fine-grained per-repo PAT over https -------------------------
# The credential store sits on the ssh-config named volume so the token
# survives container recreates. NEVER an SSH key to GitHub in here — SSH keys
# cannot be scoped per-repo, and this container must not reach beyond its own
# repo (see DEVCONTAINER_TEMPLATE.md).
RUN git config --system credential.helper 'store --file /home/dev/.ssh/git-credentials' \
 && git config --system user.name "Anton Tegnelöv" \
 && git config --system user.email "anton.tegnelov@gmail.com" \
 # The Windows host checked the worktree out with core.autocrlf=true (CRLF
 # on disk, LF in the index). The container shares that worktree via the
 # bind mount, so it must apply the same conversion or every text file
 # shows as modified. .gitattributes still forces LF where it matters.
 && git config --system core.autocrlf true

WORKDIR /workspaces/bastolk
EXPOSE 22 3000 5173

# tini is provided by docker-compose's `init: true`, which runs it as PID 1.
# Don't wrap with another tini here or you get nested-tini warnings and
# broken signal handling.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
