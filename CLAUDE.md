# Working on Bastolk

Bastolk proposes a bookkeeping entry for each bank transaction and a person
approves every one before it is exported as SIE4. The worst failure mode is a
wrong entry reaching the accounting system unnoticed: bookkeeping errors have
tax consequences, so nothing here is allowed to be silently automatic, and a
suggestion is never the same thing as a decision. The design docs were written
before the code and are authoritative: [docs/design.md](docs/design.md) says
what the tool is and what is out of scope, [docs/architecture.md](docs/architecture.md)
says how it is built, and [TODO.md](TODO.md) is the single source of
outstanding work. Where the implementation has corrected a doc, fix the doc in
the same commit and say what the evidence was.

The project is built inside a hard two-day time box and is also a learning
exercise in NestJS and LLM fine-tuning, so two habits matter: when a shortcut
and the idiomatic Nest way disagree, take the idiomatic way; when scope and the
deadline disagree, read the cut list in [docs/design.md](docs/design.md) and cut
from the top of it. The background behind the deadline and the ranked goals is
in `notes/background.md`, which is untracked — this repository is public.

## Commands

Run from `/workspaces/bastolk` inside the dev container.

```bash
pnpm install                          # workspace dependencies
pnpm --filter api prisma migrate dev  # apply/author migrations
pnpm --filter api test                # unit tests: no database, no GPU
pnpm --filter api test:e2e            # needs postgres; runs migrations first
pnpm lint && pnpm format:check        # must be clean before a task is done
pnpm typecheck                        # must be clean before a task is done
pnpm dev                              # API on :3000, web on :5173
pip install -r ml/requirements.txt    # trainer deps into /home/dev/.venv
python ml/train.py --dataset <path>   # holds the GPU; unload Ollama first
```

Before opening a PR: `pnpm verify` (lint, format, types, unit tests, e2e).

## Architecture

One pnpm workspace. `apps/api` is the NestJS application and owns all business
logic and all data; `apps/web` is a React/Vite client that only talks to the
API; `ml/` holds the Python trainer, which receives files and returns files and
never touches the database.

Inside the API, modules are per business capability: `companies` (the tenancy
guard), `sie` (SIE4 parse/import/export), `ledger`, `bank`, `predictors`,
`rules`, `suggestions`, `training`, `common`. The composition root for the
models is `predictors`: `PREDICTOR` is an injection token, `knn`, `llm` and
`composite` are the implementations, and the rest of the code asks for "a
predictor" and never learns which one answered. `sie/parser` and `rules` are
plain TypeScript with no Nest imports — they hold the logic where a bug means
wrong bookkeeping, so they must be testable without a framework.

Services: PostgreSQL with pgvector (nearest-neighbour search is a SQL query),
Redis/BullMQ (the training job), Ollama (serves the fine-tuned GGUF over HTTP).
All of them are sibling containers of the dev box; see
[.devcontainer/README.md](.devcontainer/README.md).

## Architectural decisions

These are load-bearing. Respect them unless the user explicitly overrides.

1. **The model decides the judgement, code decides the arithmetic.** A
   predictor returns only an account number and a VAT treatment. `rules` turns
   that into balanced journal lines. Never ask a model to split VAT or sum
   anything.
2. **A person approves every entry.** Confidence decides how much attention an
   entry gets, never whether it is exported. No auto-approval path.
3. **Money is integer öre.** No floats anywhere near an amount.
4. **Every table with company data carries a company id, and the guard
   supplies it.** Services never accept a company id from a request body.
5. **Real history is test data, never training data.** The LLM trains on
   synthetic examples plus corrections; the newest three months are the final
   test set and are scored rarely. The kNN model stores real examples — that
   is a different thing, and it is why the date split matters there too.
6. **A new model version must not score worse than the active one.** Promotion
   is a gate that reads stored metrics, not a judgement call.
7. **Imported history is immutable.** Corrections and decisions are new rows,
   the way bookkeeping itself works.
8. **Python only where it is unavoidable.** The trainer is Python. Dataset
   generation, evaluation bookkeeping, the baseline model and all serving calls
   are TypeScript in the API.
9. **Prisma is the ORM; the vector column needs raw SQL.** That is expected,
   not a workaround to design around.
10. **No bookkeeping data leaves the machine.** The hosted model is used
    offline to write synthetic texts and never sees a real entry. `data/` is
    gitignored, and this repository is public.

## Things that will bite

- **8 GB of VRAM holds one consumer at a time.** Training and the served model
  cannot coexist. Unload Ollama before training; the API must keep working
  from kNN while the GPU is busy, and say so in its health output.
- **SIE4 files are CP437-encoded**, not UTF-8, and `.gitattributes` marks them
  binary. Decode explicitly on import and encode explicitly on export.
- **A verification is several lines, one label.** Label extraction skips any
  verification with more than one non-bank, non-VAT line (salaries, year-end).
  Getting this wrong quietly poisons both the training set and the metrics.
- **The OpenAI-compatible Ollama endpoint drops log-probabilities.** Confidence
  is built on them, so call the native chat endpoint.
- **Never install the CUDA toolkit inside the container.** Under WSL2 the
  Windows driver is stubbed in as `libcuda.so` and those packages overwrite it.
  PyTorch wheels bring their own CUDA runtime; `gpus: all` does the rest.
- **The repo is bind-mounted from Windows.** `node_modules`, the pnpm store,
  the venv and caches are on named volumes — keep them there, and keep large
  scratch out of the checkout.
- **This repository is public.** No real company names, account balances, bank
  texts or tokens in commits, tests or fixtures.

## Rules

General craft rules live in `.claude/rules/` and load automatically.
Project-specific rules sit beside them in the same format. `.claude/` is
gitignored here: the public repository carries `CLAUDE.md` and
`docs/agent-log.md`, not the assistant configuration.
