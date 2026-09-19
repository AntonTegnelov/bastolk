# Bastolk dev container

An SSH-reachable Linux box with the whole Bastolk toolchain: Node 22 + pnpm
for the NestJS API and the React app, Python 3.12 for the QLoRA trainer, and
the host RTX 3070 through CUDA. Postgres (with pgvector), Redis and Ollama run
as sibling containers in the same compose project.

Follows the house pattern in `E:\Programmering\Code\DEVCONTAINER_TEMPLATE.md`.
Read that file before changing anything in here.

| | |
|---|---|
| Compose project | `bastolk` (repo-root `docker-compose.yml`) |
| Dev container | `bastolk`, user `dev`, workspace `/workspaces/bastolk` |
| SSH | host port **2240** → container 22 |
| API / Vite | host **3000** / **5173** |
| Postgres | host **5442** → `postgres:5432` in the network (5432 is Athenus') |
| Redis | host **6382** → `redis:6379` |
| Ollama | host **11435** → `ollama:11434` |

## Prerequisites (host, once)

1. Docker Desktop with the WSL2 backend, and GPU support enabled.
2. `%USERPROFILE%\.ssh\authorized_keys` contains the public key you connect
   with. The entrypoint installs it on every start — key changes need a
   `docker compose restart dev`, never a rebuild.
3. A **fine-grained** GitHub PAT for this repo only (Settings → Developer
   settings → Fine-grained tokens; Repository access: only `bastolk`;
   Permissions → Contents: read and write). See "Git auth" below.

## First run

```powershell
cd E:\Programmering\Code\bastolk
docker compose up -d --build dev
```

That builds the dev image and starts `postgres`, `redis` and `ollama` with it.

Then, inside the container:

```bash
ssh dev@localhost -p 2240
cd /workspaces/bastolk
pnpm install                      # once the workspace exists
pip install -r ml/requirements.txt  # trainer deps, into /home/dev/.venv
```

`pip` and `python` already resolve to `/home/dev/.venv` (a named volume), so
the multi-gigabyte torch download survives container recreates.

## Connecting

- **Plain ssh / Claude Code**: `ssh dev@localhost -p 2240`. A host alias is in
  `%USERPROFILE%\.ssh\config` as `bastolk-dev`.
- **Zed (ssh)**: `zed ssh://dev@localhost:2240/workspaces/bastolk`.
- **Zed (dev container)**: "Reopen in Dev Container" works. It *recreates* the
  compose container on first attach, which wipes the writable layer — that is
  why everything that matters (`~/.claude`, `~/.ssh`, `~/.venv`, `~/.cache`,
  `node_modules`, the pnpm store, the sshd host keys) lives on named volumes.
- **VS Code**: "Reopen in Container" via the Dev Containers extension.

## Git auth: one fine-grained PAT, this repo only

The container must never hold a credential that reaches beyond this repo, and
**never an SSH key to the GitHub account** — GitHub SSH keys cannot be scoped
per repository. The credential store lives on the `ssh-config` volume, so the
token survives recreates:

```bash
printf 'https://AntonTegnelov:<PAT>@github.com\n' > ~/.ssh/git-credentials
chmod 600 ~/.ssh/git-credentials
```

Or just `git push` and answer the prompt (username = GitHub username,
password = the PAT); the `store` helper writes the same file. The remote is
https on both host and container: the host authenticates through the Windows
credential manager, the container through this PAT.

## GPU: CUDA, and why there is no Vulkan here

`gpus: all` on both `dev` and `ollama` is the whole GPU setup. On the Docker
Desktop WSL2 backend that injects `/dev/dxg`, `libcuda.so.1`, `nvidia-smi` and
the CUDA user-space libraries from the Windows driver. PyTorch's pip wheels
bring their own CUDA runtime, cuDNN and `ptxas`, so nothing CUDA-related is
installed in the image.

Do **not** install `cuda-drivers` or the CUDA toolkit inside the container:
under WSL2 the Windows driver is stubbed in as `libcuda.so`, and those
packages overwrite it and break the GPU.

This is deliberately *not* what `wave_forge` does. That project renders with
wgpu, which needs **Vulkan**, and the NVIDIA WSL driver exposes D3D12 and CUDA
but not Vulkan — hence its Mesa "dozen" (Vulkan-on-D3D12) build stage and the
read-only `/usr/lib/wsl/{lib,drivers}` mounts. Bastolk's GPU users are PyTorch,
bitsandbytes and Ollama, all CUDA-only, so none of that applies: the CUDA path
is the supported one, and it is one line of compose.

Verify:

```bash
nvidia-smi                                    # RTX 3070, 8192 MiB
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
docker compose logs ollama | grep -i cuda     # from the host
```

### 8 GB is one GPU consumer at a time

QLoRA training (in this container) and the served model (in `ollama`) cannot
both hold the card. The training job unloads the active model from Ollama
before it starts, and the API falls back to the nearest-neighbour predictor
while the GPU is busy. `OLLAMA_KEEP_ALIVE=5m` keeps an idle model from sitting
on VRAM forever.

## Services from inside the container

```bash
psql "$DATABASE_URL" -c '\dx'            # pgvector present?
redis-cli -u "$REDIS_URL" ping
curl "$OLLAMA_BASE_URL/api/tags"
```

`DATABASE_URL`, `REDIS_URL`, `OLLAMA_BASE_URL` and `MODELS_DIR` are in
`/etc/environment`, so ssh login shells get them too (Docker `ENV` alone does
not reach sshd sessions).

`MODELS_DIR=/models` is a named volume mounted at the same path in both `dev`
and `ollama`: the trainer writes `<version>.gguf` there and the worker
registers it with Ollama from that path.

## Troubleshooting

- **SSH refused**: `docker compose ps dev` — if it is `Created`, not
  `Up`, a port mapping collided. Never add `forwardPorts` to
  `devcontainer.json`; Zed turns it into a real published port and it
  collides with `2240:22`.
- **"Permission denied (publickey)"**: the host `authorized_keys` is missing
  or empty. Fix it and `docker compose restart dev`.
- **`Permission denied` writing into `apps/api` or `apps/web`**: those
  directories must exist in the checkout. Docker creates a missing bind-mount
  parent (for the `node_modules` volumes inside them) as a root-owned 755
  directory that `dev` cannot write into, while a directory that came from the
  host is world-writable. That is what the `.gitkeep` files are for — recreate
  the directory from Windows and `docker compose up -d dev` again.
- **Every file shows as modified, `git diff --stat` is empty**: the other side
  of the bind mount touched the index. `git checkout -- <files>`. Not
  `git update-index -- <path>`, which stages it.
- **`torch.cuda.is_available()` is False**: check `nvidia-smi` inside the
  container first. If that fails too, the GPU is not reaching the container —
  restart Docker Desktop, and check that `gpus: all` is still on the service.
- **Ollama says no GPU**: `docker compose logs ollama`. It falls back to CPU
  silently, which looks like "the model is very slow" rather than an error.
- **Out of system RAM while merging or converting a model**: the container
  gets whatever WSL2 gets, which defaults to half the host's 16 GB (`free -g`
  showed 7 GB). If a merge or GGUF conversion is killed, add a
  `%USERPROFILE%\.wslconfig` with `memory=11GB` and `wsl --shutdown` — that
  stops every container, so do it between work sessions, not mid-run.
- **Out of VRAM during training**: something is still loaded in Ollama.
  `curl $OLLAMA_BASE_URL/api/generate -d '{"model":"<name>","keep_alive":0}'`.

## Where the bytes go

`E:` has ~18 GB free, so nothing large may land in the checkout. It does not
have to: `node_modules`, the pnpm store, `/home/dev/.venv` (torch alone is
~5 GB), the caches, `/models` and the Ollama blobs are all named volumes,
which live in Docker Desktop's VM disk on `C:`. Keep datasets and model files
under `/models` or `data/` (gitignored), and check `df -h .` before blaming a
tool for a mysterious I/O error.

## Do not rebuild casually

`docker compose down` / `up` is safe: everything that matters is on named
volumes. A `docker compose down -v` is **not** — it deletes the database, the
Claude login, the PAT store and the trained models. Never run it from inside
an agent session.
