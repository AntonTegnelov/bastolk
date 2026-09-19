#!/bin/sh
# Entrypoint for the dev container. Runs under tini (compose init: true).
# Installs authorized_keys from the host bind mount, generates persistent
# host keys, self-heals volume ownership, then execs sshd.
set -eu

# Generate missing host keys into the persistent volume at /etc/ssh/keys.
# Idempotent: only types that don't already exist are created, so the
# fingerprint stays stable across `docker compose down/up` cycles.
mkdir -p /etc/ssh/keys
chmod 700 /etc/ssh/keys
for type in rsa ecdsa ed25519; do
    key="/etc/ssh/keys/ssh_host_${type}_key"
    if [ ! -f "$key" ]; then
        ssh-keygen -q -t "$type" -N '' -f "$key"
    fi
done
chmod 600 /etc/ssh/keys/ssh_host_*_key
chmod 644 /etc/ssh/keys/ssh_host_*_key.pub

# Install authorized_keys from the read-only host mount; strip CRLF in case
# the host file was saved by a Windows editor. Runs on every start, so key
# changes only need a container restart — no rebuild.
if [ -s /tmp/host_authorized_keys ]; then
    install -d -m 700 -o dev -g dev /home/dev/.ssh
    tr -d '\r' < /tmp/host_authorized_keys > /home/dev/.ssh/authorized_keys
    chown dev:dev /home/dev/.ssh/authorized_keys
    chmod 600 /home/dev/.ssh/authorized_keys
else
    echo "WARNING: /tmp/host_authorized_keys missing/empty - SSH login will fail." >&2
    echo "         Populate %USERPROFILE%\.ssh\authorized_keys and restart the container." >&2
fi

# Self-heal ownership of named volumes (root-owned when Docker creates them).
# /models is shared with the ollama container, which runs as root: the trainer
# writes GGUF files there as dev, ollama only reads them.
for d in /home/dev/.claude /home/dev/.venv /home/dev/.cache \
         /home/dev/.local/share/pnpm-store \
         /workspaces/bastolk/node_modules \
         /workspaces/bastolk/apps/api/node_modules \
         /workspaces/bastolk/apps/web/node_modules \
         /models; do
    [ -d "$d" ] || continue
    chown dev:dev "$d"
    chmod 0755 "$d"
done

# Create the Python venv on the named volume on first start (idempotent).
# The trainer's own dependencies (torch, unsloth, ...) are installed from
# ml/requirements.txt — see .devcontainer/README.md, not baked into the image.
if [ ! -x /home/dev/.venv/bin/python ]; then
    su -s /bin/sh dev -c 'python3 -m venv /home/dev/.venv && /home/dev/.venv/bin/pip install --quiet --upgrade pip'
fi

# The PAT credential store (if installed) must stay private to dev.
if [ -f /home/dev/.ssh/git-credentials ]; then
    chown dev:dev /home/dev/.ssh/git-credentials
    chmod 600 /home/dev/.ssh/git-credentials
fi

exec /usr/sbin/sshd -D -e
