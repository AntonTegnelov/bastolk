# Bastolk

Bastolk suggests a bookkeeping entry for each bank transaction. Suggestions
come from two local models — a small LLM fine-tuned on synthetic Swedish
transaction texts, and a nearest-neighbour model that learns one company's own
habits — and a person reviews every one of them. Approved entries leave the
tool as a SIE4 file that the real accounting system imports.

Nothing is posted anywhere automatically: the tool proposes, a human decides.

- **Design** (what it does and why): [docs/design.md](docs/design.md)
- **Architecture** (how it is built): [docs/architecture.md](docs/architecture.md)
- **Outstanding work**: [TODO.md](TODO.md)
- **Where the coding agent went wrong**: [docs/agent-log.md](docs/agent-log.md)

## Status

Early. The docs are written, the dev container runs, the application is being
built.

## Stack

NestJS + Prisma + PostgreSQL (pgvector) + BullMQ/Redis on the backend, React +
Vite on the frontend, one pnpm workspace. The fine-tuned model is trained with
QLoRA in Python and served by Ollama over local HTTP. Everything runs locally:
no bookkeeping data leaves the machine.

## Running it

Everything runs in Docker, with the dev container as the place you work from.

```bash
docker compose up -d --build dev     # dev box + postgres + redis + ollama
ssh dev@localhost -p 2240            # or open the folder in Zed / VS Code
```

Inside the container:

```bash
pnpm install                         # workspace dependencies
pnpm --filter api prisma migrate dev # database schema
pnpm dev                             # API on :3000, web on :5173
```

Setup, GPU notes and troubleshooting: [.devcontainer/README.md](.devcontainer/README.md).

## Data

`data/` is gitignored. Real SIE4 exports, bank CSVs, generated datasets and
model weights stay out of the repository; the tests use a small synthetic SIE
file that is committed.

## Licence

MIT — see [LICENSE](LICENSE).
